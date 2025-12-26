import { safeStringify } from '../json';
import { FetchAdapter, FetchResponse } from './adapter';
import { buildUrl, toServiceException } from './_util';
import { StructuredError } from '../error';

// Use Web API streams - in Node.js/Bun, import from 'stream/web' which provides proper Web API
// In browsers, use globalThis directly
// Check for Node.js/Bun by looking for process.versions.node
const isNode =
	typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const streamWeb = isNode ? require('stream/web') : globalThis;
const NativeWritableStream = streamWeb.WritableStream as typeof WritableStream;
const NativeReadableStream = streamWeb.ReadableStream as typeof ReadableStream;
const NativeCompressionStream = (streamWeb.CompressionStream ??
	globalThis.CompressionStream) as typeof CompressionStream;

/**
 * Properties for creating a stream
 */
export interface CreateStreamProps {
	/**
	 * optional metadata for the stream
	 */
	metadata?: Record<string, string>;

	/**
	 * optional contentType for the stream data. If not set, defaults to application/octet-stream
	 */
	contentType?: string;

	/**
	 * optional flag to enable gzip compression of stream data during upload. if true, will also add
	 * add Content-Encoding: gzip header to responses. The client MUST be able to accept gzip
	 * compression for this to work or must be able to uncompress the raw data it receives.
	 */
	compress?: true;
}

/**
 * Parameters for listing streams
 */
export interface ListStreamsParams {
	/**
	 * optional name filter to search for streams
	 */
	name?: string;

	/**
	 * optional metadata filters to match streams
	 */
	metadata?: Record<string, string>;

	/**
	 * maximum number of streams to return (default: 100, max: 1000)
	 */
	limit?: number;

	/**
	 * number of streams to skip for pagination
	 */
	offset?: number;
}

/**
 * Stream information returned by list operation
 */
export interface StreamInfo {
	/**
	 * unique stream identifier
	 */
	id: string;

	/**
	 * the name of the stream
	 */
	name: string;

	/**
	 * the stream metadata
	 */
	metadata: Record<string, string>;

	/**
	 * the public URL to access the stream
	 */
	url: string;

	/**
	 * the size of the stream in bytes
	 */
	sizeBytes: number;
}

/**
 * Response from listing streams
 */
export interface ListStreamsResponse {
	/**
	 * whether the request was successful
	 */
	success: boolean;

	/**
	 * optional error message if not successful
	 */
	message?: string;

	/**
	 * array of streams matching the filter criteria
	 */
	streams: StreamInfo[];

	/**
	 * total count of streams matching the filter (useful for pagination)
	 */
	total: number;
}

/**
 * A durable and resumable stream that can be written to and read many times.
 * The underlying stream is backed by a durable storage system and the URL
 * returned is public and guaranteed to return the same data every time it is accessed.
 * You can read from this stream internal in the agent using the getReader() method or
 * return the URL to the stream to be used externally.
 *
 * You must write and close the stream before it can be read but if you attempt to read
 * before any data is written, the reader will block until the first write occurs.
 */
export interface Stream extends WritableStream {
	/**
	 * unique stream identifier
	 */
	id: string;
	/**
	 * the unique stream url to consume the stream
	 */
	url: string;
	/**
	 * the total number of bytes written to the stream
	 */
	readonly bytesWritten: number;
	/**
	 * whether the stream is using compression
	 */
	readonly compressed: boolean;
	/**
	 * write data to the stream
	 */
	write(chunk: string | Uint8Array | ArrayBuffer | object): Promise<void>;
	/**
	 * close the stream gracefully, handling already closed streams without error
	 */
	close(): Promise<void>;
	/**
	 * get a ReadableStream that streams from the internal URL
	 *
	 * Note: This method will block waiting for data until writes start to the Stream.
	 * The returned ReadableStream will remain open until the Stream is closed or an error occurs.
	 *
	 * @returns a ReadableStream that can be passed to response.stream()
	 */
	getReader(): ReadableStream<Uint8Array>;
}

/**
 * Stream API for creating and managing durable, resumable data streams.
 * Streams are backed by durable storage and provide public URLs for access.
 */
export interface StreamStorage {
	/**
	 * Create a new stream for writing data that can be read multiple times
	 *
	 * @param name - the name of the stream (1-254 characters). Use names to group and organize streams.
	 * @param props - optional properties including metadata, content type, and compression
	 * @returns a Promise that resolves to the created Stream
	 *
	 * @example
	 * ```typescript
	 * // Create a simple text stream
	 * const stream = await streams.create('agent-logs');
	 * await stream.write('Starting agent execution\n');
	 * await stream.write('Processing data...\n');
	 * await stream.close();
	 * console.log('Stream URL:', stream.url);
	 *
	 * // Create a compressed JSON stream with metadata
	 * const dataStream = await streams.create('data-export', {
	 *   contentType: 'application/json',
	 *   compress: true,
	 *   metadata: { exportDate: '2024-01-15', version: '1.0' }
	 * });
	 * await dataStream.write({ records: [...] });
	 * await dataStream.close();
	 *
	 * // Read back from the stream
	 * const reader = dataStream.getReader();
	 * for await (const chunk of reader) {
	 *   console.log('Chunk:', chunk);
	 * }
	 * ```
	 */
	create(name: string, props?: CreateStreamProps): Promise<Stream>;

	/**
	 * Get stream metadata by ID
	 *
	 * @param id - the stream ID
	 * @returns a Promise that resolves to the stream information
	 *
	 * @example
	 * ```typescript
	 * const stream = await streams.get('stream_0199a52b06e3767dbe2f10afabb5e5e4');
	 * console.log(`Name: ${stream.name}, Size: ${stream.sizeBytes} bytes`);
	 * ```
	 */
	get(id: string): Promise<StreamInfo>;

	/**
	 * Download stream content
	 *
	 * @param id - the stream ID to download
	 * @returns a Promise that resolves to a ReadableStream of the content
	 *
	 * @example
	 * ```typescript
	 * const readable = await streams.download('stream_0199a52b06e3767dbe2f10afabb5e5e4');
	 * // Pipe to a file or process the stream
	 * ```
	 */
	download(id: string): Promise<ReadableStream<Uint8Array>>;

	/**
	 * List streams with optional filtering and pagination
	 *
	 * @param params - optional parameters for filtering and pagination
	 * @returns a Promise that resolves to the list of streams with metadata
	 *
	 * @example
	 * ```typescript
	 * // List all streams
	 * const all = await streams.list();
	 * console.log(`Found ${all.total} streams`);
	 *
	 * // Filter by name
	 * const logs = await streams.list({ name: 'agent-logs' });
	 *
	 * // Filter by metadata and paginate
	 * const filtered = await streams.list({
	 *   metadata: { type: 'export' },
	 *   limit: 50,
	 *   offset: 100
	 * });
	 *
	 * for (const stream of filtered.streams) {
	 *   console.log(`${stream.name}: ${stream.sizeBytes} bytes at ${stream.url}`);
	 * }
	 * ```
	 */
	list(params?: ListStreamsParams): Promise<ListStreamsResponse>;

	/**
	 * Delete a stream by its ID
	 *
	 * @param id - the stream ID to delete
	 * @returns a Promise that resolves when the stream is deleted
	 *
	 * @example
	 * ```typescript
	 * await streams.delete('stream-id-123');
	 * ```
	 */
	delete(id: string): Promise<void>;
}

const encoder = new TextEncoder();

const ReadStreamFailedError = StructuredError('ReadStreamFailedError')<{ status: number }>();

/**
 * A writable stream implementation using composition (browser-compatible)
 * This approach works across all environments since native WritableStream can't be properly extended
 */
class StreamImpl implements Stream {
	public readonly id: string;
	public readonly url: string;
	readonly #writable: WritableStream<Uint8Array>;
	#compressed: boolean;
	#adapter: FetchAdapter;
	#sink: UnderlyingSinkState;
	#closed = false;

	constructor(
		id: string,
		url: string,
		compressed: boolean,
		sink: UnderlyingSinkState,
		writable: WritableStream<Uint8Array>,
		adapter: FetchAdapter
	) {
		this.id = id;
		this.url = url;
		this.#compressed = compressed;
		this.#adapter = adapter;
		this.#sink = sink;
		this.#writable = writable;
	}

	get bytesWritten(): number {
		return this.#sink.total;
	}

	get compressed(): boolean {
		return this.#compressed;
	}

	// WritableStream interface properties
	get locked(): boolean {
		return this.#writable.locked;
	}

	/**
	 * Write data to the stream
	 */
	async write(chunk: string | Uint8Array | ArrayBuffer | object): Promise<void> {
		let binaryChunk: Uint8Array;
		if (chunk instanceof Uint8Array) {
			binaryChunk = chunk;
		} else if (typeof chunk === 'string') {
			binaryChunk = encoder.encode(chunk);
		} else if (chunk instanceof ArrayBuffer) {
			binaryChunk = new Uint8Array(chunk);
		} else if (typeof chunk === 'object' && chunk !== null) {
			binaryChunk = encoder.encode(safeStringify(chunk));
		} else {
			binaryChunk = encoder.encode(String(chunk));
		}

		// Delegate to the underlying sink's write method
		await this.#sink.write(binaryChunk);
	}

	/**
	 * Close the stream gracefully, handling already closed streams without error
	 */
	async close(): Promise<void> {
		if (this.#closed) {
			return;
		}
		this.#closed = true;

		try {
			await this.#sink.close();
		} catch (error) {
			// If we get a TypeError about the stream being closed, locked, or errored,
			// that means pipeTo() or another operation already closed it or it's in use
			if (
				error instanceof TypeError &&
				(error.message.includes('closed') ||
					error.message.includes('errored') ||
					error.message.includes('Cannot close'))
			) {
				// Silently return - this is the desired behavior
				return;
			}
			// If the stream is locked, try to close the underlying writer
			if (error instanceof TypeError && error.message.includes('locked')) {
				// Best-effort closure for locked streams
				return;
			}
			// Re-throw any other errors
			throw error;
		}
	}

	/**
	 * Abort the stream with an optional reason
	 */
	abort(reason?: unknown): Promise<void> {
		return this.#writable.abort(reason);
	}

	/**
	 * Get a writer for the underlying stream
	 */
	getWriter(): WritableStreamDefaultWriter<Uint8Array> {
		return this.#writable.getWriter();
	}

	/**
	 * Get a ReadableStream that streams from the internal URL
	 *
	 * Note: This method will block waiting for data until writes start to the Stream.
	 * The returned ReadableStream will remain open until the Stream is closed or an error occurs.
	 *
	 * @returns a ReadableStream that can be passed to response.stream()
	 */
	getReader(): ReadableStream<Uint8Array> {
		const url = this.url;
		const adapter = this.#adapter;
		let ac: AbortController | null = null;
		// Use native ReadableStream to avoid polyfill interference
		return new NativeReadableStream({
			async start(controller) {
				try {
					ac = new AbortController();
					const res = await adapter.invoke(url, {
						method: 'GET',
						signal: ac.signal,
						binary: true,
					});

					const response = res.response;

					if (!res.ok) {
						controller.error(
							new ReadStreamFailedError({
								status: response.status,
								message: `Failed to read stream: ${response.status} ${response.statusText}`,
							})
						);
						return;
					}

					if (!response.body) {
						controller.error(
							new ReadStreamFailedError({
								status: response.status,
								message: 'Response body was null',
							})
						);
						return;
					}

					const reader = response.body.getReader();
					try {
						// Iterative read to avoid recursive promise chains
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;
							if (value) controller.enqueue(value);
						}
						controller.close();
					} catch (error) {
						controller.error(error);
					}
				} catch (error) {
					controller.error(error);
				}
			},
			cancel(reason?: unknown) {
				if (ac) {
					ac.abort(reason);
					ac = null;
				}
			},
		});
	}
}

const StreamWriterInitializationError = StructuredError(
	'StreamWriterInitializationError',
	'Stream writer is not initialized'
);

const StreamAPIError = StructuredError('StreamAPIError')<{ status: number }>();

// State object that handles the actual streaming to the backend
// This is used by StreamImpl to manage write operations
class UnderlyingSinkState {
	adapter: FetchAdapter;
	abortController: AbortController | null = null;
	writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	writable: WritableStream<Uint8Array> | null = null;
	putRequestPromise: Promise<FetchResponse<unknown>> | null = null;
	total = 0;
	closed = false;
	url: string;
	props?: CreateStreamProps;

	constructor(url: string, adapter: FetchAdapter, props?: CreateStreamProps) {
		this.url = url;
		this.adapter = adapter;
		this.props = props;
	}

	async start(): Promise<WritableStream<Uint8Array>> {
		// Create AbortController for the fetch request
		this.abortController = new AbortController();

		// Create a pass-through WritableStream that writes to a ReadableStream
		// Use native streams captured at module load to avoid polyfill interference
		let readableController: ReadableStreamDefaultController<Uint8Array>;
		const readable = new NativeReadableStream<Uint8Array>({
			start: (controller) => {
				readableController = controller;
			},
		});

		// Create a WritableStream that pushes chunks to the ReadableStream
		this.writable = new NativeWritableStream<Uint8Array>({
			write: (chunk) => {
				readableController.enqueue(chunk);
				this.total += chunk.length;
			},
			close: () => {
				readableController.close();
			},
			abort: (reason) => {
				readableController.error(reason);
			},
		});

		// If compression is enabled, pipe through gzip
		let bodyStream: ReadableStream<Uint8Array> = readable;
		if (this.props?.compress) {
			const compressionStream = new NativeCompressionStream('gzip');
			bodyStream = readable.pipeThrough(compressionStream);
		}

		// Start the PUT request with the readable stream as body
		const headers: Record<string, string> = {
			'Content-Type': this.props?.contentType || 'application/octet-stream',
		};

		if (this.props?.compress) {
			headers['Content-Encoding'] = 'gzip';
		}

		this.putRequestPromise = this.adapter.invoke(this.url, {
			method: 'PUT',
			headers,
			body: bodyStream,
			signal: this.abortController.signal,
			duplex: 'half',
		});

		return this.writable;
	}

	async write(chunk: Uint8Array) {
		if (!this.writable) {
			throw new StreamWriterInitializationError();
		}
		if (!this.writer) {
			this.writer = this.writable.getWriter();
		}
		// Write the chunk to the writable stream
		await this.writer.write(chunk);
	}
	async close() {
		if (this.closed) {
			return;
		}
		this.closed = true;

		// Close the writable stream - get writer if we don't have one
		if (this.writable) {
			if (!this.writer) {
				this.writer = this.writable.getWriter();
			}
			await this.writer.close();
			this.writer = null;
		}

		// Wait for the PUT request to complete
		if (this.putRequestPromise) {
			try {
				const res = await this.putRequestPromise;
				if (!res.ok) {
					throw new StreamAPIError({
						status: res.response.status,
						message: `PUT request failed: ${res.response.status} ${res.response.statusText}`,
					});
				}
			} catch (error) {
				if (error instanceof Error && error.name !== 'AbortError') {
					throw error;
				}
			}
			this.putRequestPromise = null;
		}
		this.abortController = null;
	}
	async abort(reason?: unknown) {
		if (this.writer) {
			await this.writer.abort(reason);
			this.writer = null;
		}
		// Abort the fetch request
		if (this.abortController) {
			this.abortController.abort(reason);
			this.abortController = null;
		}
		this.putRequestPromise = null;
	}
}

const StreamNameInvalidError = StructuredError(
	'StreamNameInvalidError',
	'Stream name must be between 1 and 254 characters'
);

const StreamLimitInvalidError = StructuredError(
	'StreamLimitInvalidError',
	'Stream limit must be greater than 0 and less than or equal to 1000'
);

const StreamIDRequiredError = StructuredError(
	'StreamIDRequiredError',
	'Stream id is required and must be a non-empty string'
);

export class StreamStorageService implements StreamStorage {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async create(name: string, props?: CreateStreamProps): Promise<Stream> {
		if (!name || name.length < 1 || name.length > 254) {
			throw new StreamNameInvalidError();
		}
		const url = this.#baseUrl;
		const signal = AbortSignal.timeout(10_000);
		const attributes: Record<string, string> = {
			name,
		};
		if (!props?.contentType) {
			props = props ?? {};
			props.contentType = 'application/octet-stream';
		}
		if (props?.metadata) {
			attributes['metadata'] = JSON.stringify(props.metadata);
		}
		if (props?.contentType) {
			attributes['stream.content_type'] = props.contentType;
		}
		const body = JSON.stringify({
			name,
			...(props?.metadata && { metadata: props.metadata }),
			...(props?.contentType && { contentType: props.contentType }),
		});
		const res = await this.#adapter.invoke<{ id: string }>(url, {
			method: 'POST',
			body,
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.stream.create',
				attributes,
			},
		});
		if (res.ok) {
			const streamUrl = buildUrl(this.#baseUrl, res.data.id);
			const sink = new UnderlyingSinkState(streamUrl, this.#adapter, props);
			// Initialize the sink (start the PUT request) and get the writable stream
			const writable = await sink.start();

			const stream = new StreamImpl(
				res.data.id,
				streamUrl,
				props?.compress ?? false,
				sink,
				writable,
				this.#adapter
			);

			return stream;
		}
		throw await toServiceException('POST', url, res.response);
	}

	async list(params?: ListStreamsParams): Promise<ListStreamsResponse> {
		const attributes: Record<string, string> = {};
		if (params?.limit !== undefined) {
			if (params.limit <= 0 || params.limit > 1000) {
				throw new StreamLimitInvalidError();
			}
			attributes['limit'] = String(params.limit);
		}
		if (params?.offset !== undefined) {
			attributes['offset'] = String(params.offset);
		}
		if (params?.name) {
			attributes['name'] = params.name;
		}
		if (params?.metadata) {
			attributes['metadata'] = JSON.stringify(params.metadata);
		}

		const requestBody: Record<string, unknown> = {};
		if (params?.name) {
			requestBody.name = params.name;
		}
		if (params?.metadata) {
			requestBody.metadata = params.metadata;
		}
		if (params?.limit) {
			requestBody.limit = params.limit;
		}
		if (params?.offset) {
			requestBody.offset = params.offset;
		}

		const signal = AbortSignal.timeout(30_000);
		const url = buildUrl(this.#baseUrl, 'list');
		const res = await this.#adapter.invoke<{
			success: boolean;
			message?: string;
			streams: Array<{
				id: string;
				name: string;
				metadata: Record<string, string>;
				url: string;
				size_bytes: number;
			}>;
			total: number;
		}>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(requestBody),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.stream.list',
				attributes,
			},
		});
		if (res.ok) {
			// Transform snake_case to camelCase for sizeBytes
			return {
				success: res.data.success,
				message: res.data.message,
				streams: res.data.streams.map((s) => ({
					id: s.id,
					name: s.name,
					metadata: s.metadata,
					url: s.url,
					sizeBytes: s.size_bytes,
				})),
				total: res.data.total,
			};
		}
		throw await toServiceException('POST', url, res.response);
	}

	async get(id: string): Promise<StreamInfo> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new StreamIDRequiredError();
		}
		const signal = AbortSignal.timeout(30_000);
		const url = buildUrl(this.#baseUrl, id, 'info');
		const res = await this.#adapter.invoke<{
			id: string;
			name: string;
			metadata: Record<string, string>;
			url: string;
			size_bytes: number;
		}>(url, {
			method: 'POST',
			signal,
			body: '{}',
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.stream.get',
				attributes: {
					'stream.id': id,
				},
			},
		});
		if (res.ok) {
			return {
				id: res.data.id,
				name: res.data.name,
				metadata: res.data.metadata,
				url: res.data.url,
				sizeBytes: res.data.size_bytes,
			};
		}
		throw await toServiceException('POST', url, res.response);
	}

	async download(id: string): Promise<ReadableStream<Uint8Array>> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new StreamIDRequiredError();
		}
		const signal = AbortSignal.timeout(300_000); // 5 minutes for download
		const url = buildUrl(this.#baseUrl, id);
		const res = await this.#adapter.invoke(url, {
			method: 'GET',
			signal,
			binary: true,
			telemetry: {
				name: 'agentuity.stream.download',
				attributes: {
					'stream.id': id,
				},
			},
		});
		if (res.ok && res.response.body) {
			return res.response.body;
		}
		throw await toServiceException('GET', url, res.response);
	}

	async delete(id: string): Promise<void> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new StreamIDRequiredError();
		}
		const signal = AbortSignal.timeout(30_000);
		const url = buildUrl(this.#baseUrl, id);
		const res = await this.#adapter.invoke<void>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.stream.delete',
				attributes: {
					'stream.id': id,
				},
			},
		});
		if (res.ok) {
			return;
		}
		throw await toServiceException('DELETE', url, res.response);
	}
}
