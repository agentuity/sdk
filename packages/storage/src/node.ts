/**
 * Node-backed implementation of `S3ClientLike`.
 *
 * Wraps `@aws-sdk/client-s3`. Resolvable on both Node and Bun, so it
 * can serve as the package's default fallback for resolvers that do
 * not honor the `"bun"` exports condition.
 *
 * Design notes:
 *
 * 1. **Lazy SDK loading.** `@aws-sdk/client-s3` is large (~1 MB on
 *    disk) and imports several hundred files at startup. To keep the
 *    cost off the cold-start path of callers that import this module
 *    but never actually upload/download, the SDK is loaded via dynamic
 *    `import()` on first method call.
 *
 * 2. **Streamed uploads track byte counts via a counting passthrough.**
 *    `PutObjectCommand` does not report bytes uploaded. For
 *    fixed-size bodies (`Uint8Array`, `ArrayBuffer`, `Buffer`,
 *    `string`, `Blob`) we use `.byteLength` / `.size`. For
 *    `ReadableStream` bodies we wrap the source in a counting
 *    `Transform` so the returned byte count matches what was actually
 *    sent on the wire.
 *
 * 3. **Bucket-in-endpoint addressing.** Agentuity buckets use
 *    virtual-host-style endpoints (`<bucket>.<host>`), so the bucket
 *    name is implicit in the URL. The SDK still requires a `Bucket`
 *    parameter on each command; we extract it from the endpoint's
 *    leading hostname label and rely on the endpoint override to route
 *    correctly. `forcePathStyle` is `false`.
 */

import { Buffer } from 'node:buffer';
import { Readable, Transform } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import type {
	BucketConfig,
	S3Body,
	S3ClientLike,
	S3FileLike,
	S3ListOptions,
	S3ListResult,
	S3StatResult,
	S3WriteOptions,
} from './types.ts';

export type { BucketConfig, S3ClientLike } from './types.ts';

// Lazy-loaded handle to `@aws-sdk/client-s3`. Populated on first call to
// `loadSdk()`; subsequent calls reuse the cached module.
type SdkModule = typeof import('@aws-sdk/client-s3');
let sdkModule: SdkModule | null = null;
let sdkPromise: Promise<SdkModule> | null = null;

async function loadSdk(): Promise<SdkModule> {
	if (sdkModule) return sdkModule;
	if (!sdkPromise) {
		sdkPromise = import('@aws-sdk/client-s3').then((mod) => {
			sdkModule = mod;
			return mod;
		});
	}
	return sdkPromise;
}

interface InternalState {
	endpoint: string;
	bucketLabel: string;
	region: string;
	credentials: { accessKeyId: string; secretAccessKey: string };
	/** Cached SDK client; created on first use. */
	clientPromise: Promise<import('@aws-sdk/client-s3').S3Client> | null;
}

export function createS3Client(bucket: BucketConfig): S3ClientLike {
	const endpoint = bucket.endpoint.startsWith('http')
		? bucket.endpoint
		: `https://${bucket.endpoint}`;

	// Extract the leading hostname label as the bucket name. The endpoint
	// is virtual-hosted-style (`<bucket>.<host>`), so the SDK's `Bucket`
	// parameter is essentially a placeholder — what actually routes the
	// request is the `endpoint` URL.
	const bucketLabel = extractBucketLabel(endpoint);

	const state: InternalState = {
		endpoint,
		bucketLabel,
		region: bucket.region || 'auto',
		credentials: {
			accessKeyId: bucket.access_key,
			secretAccessKey: bucket.secret_key,
		},
		clientPromise: null,
	};

	const getClient = async () => {
		if (!state.clientPromise) {
			const sdk = await loadSdk();
			state.clientPromise = Promise.resolve(
				new sdk.S3Client({
					endpoint: state.endpoint,
					region: state.region,
					credentials: state.credentials,
					forcePathStyle: false,
				})
			);
		}
		return state.clientPromise;
	};

	return {
		async list(opts?: S3ListOptions | null): Promise<S3ListResult> {
			const sdk = await loadSdk();
			const client = await getClient();
			const out = await client.send(
				new sdk.ListObjectsV2Command({
					Bucket: state.bucketLabel,
					Prefix: opts?.prefix,
					MaxKeys: opts?.maxKeys,
					ContinuationToken: opts?.continuationToken,
				})
			);
			return {
				contents: (out.Contents ?? []).map((o) => ({
					key: o.Key ?? '',
					size: o.Size ?? 0,
					lastModified: o.LastModified?.toISOString() ?? '',
					etag: o.ETag,
				})),
				isTruncated: out.IsTruncated ?? false,
				nextContinuationToken: out.NextContinuationToken,
			};
		},

		async stat(key: string): Promise<S3StatResult> {
			const sdk = await loadSdk();
			const client = await getClient();
			const out = await client.send(
				new sdk.HeadObjectCommand({ Bucket: state.bucketLabel, Key: key })
			);
			return {
				size: out.ContentLength ?? 0,
				type: out.ContentType,
				lastModified: out.LastModified,
				etag: out.ETag,
			};
		},

		file(key: string): S3FileLike {
			// Mutable holder for the most recently observed Content-Type.
			// Populated by the first arrayBuffer/text/stream call; matches
			// the contract documented on S3FileLike.type.
			const meta: { type?: string } = {};
			return {
				get type(): string | undefined {
					return meta.type;
				},
				async arrayBuffer(): Promise<ArrayBuffer> {
					const sdk = await loadSdk();
					const client = await getClient();
					const out = await client.send(
						new sdk.GetObjectCommand({ Bucket: state.bucketLabel, Key: key })
					);
					if (out.ContentType) meta.type = out.ContentType;
					return readBodyAsArrayBuffer(out.Body);
				},
				async text(): Promise<string> {
					const buf = await this.arrayBuffer();
					return new TextDecoder().decode(buf);
				},
				stream(): ReadableStream<Uint8Array> {
					// Lazily fetch on first pull so callers can hold a handle
					// without triggering a network call upfront.
					let inner: ReadableStream<Uint8Array> | null = null;
					let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
					return new ReadableStream<Uint8Array>({
						async pull(controller) {
							if (!inner) {
								const sdk = await loadSdk();
								const client = await getClient();
								const out = await client.send(
									new sdk.GetObjectCommand({
										Bucket: state.bucketLabel,
										Key: key,
									})
								);
								if (out.ContentType) meta.type = out.ContentType;
								inner = bodyToWebStream(out.Body);
								reader = inner.getReader() as ReadableStreamDefaultReader<Uint8Array>;
							}
							const { value, done } = await reader!.read();
							if (done) controller.close();
							else controller.enqueue(value);
						},
						async cancel() {
							await reader?.cancel();
						},
					});
				},
			};
		},

		async write(key: string, body: S3Body, opts?: S3WriteOptions): Promise<number> {
			const sdk = await loadSdk();
			const client = await getClient();
			const { Body, getBytesUploaded } = prepareBody(body);
			await client.send(
				new sdk.PutObjectCommand({
					Bucket: state.bucketLabel,
					Key: key,
					Body,
					ContentType: opts?.type,
				})
			);
			return getBytesUploaded();
		},

		async delete(key: string): Promise<void> {
			const sdk = await loadSdk();
			const client = await getClient();
			await client.send(new sdk.DeleteObjectCommand({ Bucket: state.bucketLabel, Key: key }));
		},
	};
}

/**
 * Convert one of our accepted `S3Body` shapes into something the AWS
 * SDK can consume, while also preparing a way to report the number of
 * bytes that flowed to S3.
 *
 * For fixed-size bodies the count is known up front. For streaming
 * bodies we attach a counting `Transform` and read the tally back after
 * the upload completes.
 */
function prepareBody(body: S3Body): {
	Body: Uint8Array | Buffer | Readable | string;
	getBytesUploaded(): number;
} {
	if (typeof body === 'string') {
		const bytes = Buffer.byteLength(body, 'utf-8');
		return { Body: body, getBytesUploaded: () => bytes };
	}
	if (body instanceof Uint8Array) {
		return { Body: body, getBytesUploaded: () => body.byteLength };
	}
	if (body instanceof ArrayBuffer) {
		const buf = Buffer.from(body);
		return { Body: buf, getBytesUploaded: () => buf.byteLength };
	}
	if (typeof Blob !== 'undefined' && body instanceof Blob) {
		// Convert the Blob to a Node stream, counting bytes as it flows.
		const webStream = body.stream() as unknown as NodeWebReadableStream<Uint8Array>;
		const nodeStream = Readable.fromWeb(webStream);
		const { stream, getBytes } = countingPassthrough(nodeStream);
		return { Body: stream, getBytesUploaded: getBytes };
	}
	if (isWebReadableStream(body)) {
		const nodeStream = Readable.fromWeb(body as unknown as NodeWebReadableStream<Uint8Array>);
		const { stream, getBytes } = countingPassthrough(nodeStream);
		return { Body: stream, getBytesUploaded: getBytes };
	}
	// Fallthrough: pass through whatever it is. Should be unreachable
	// given the `S3Body` union, but keeps the function total.
	return {
		Body: body as unknown as Uint8Array,
		getBytesUploaded: () => 0,
	};
}

function isWebReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { getReader?: unknown }).getReader === 'function'
	);
}

/**
 * Wrap a Node `Readable` in a passthrough that counts bytes flowing
 * through it. The returned `getBytes()` callback returns the running
 * tally; call it after the consumer has finished reading.
 */
function countingPassthrough(source: Readable): {
	stream: Readable;
	getBytes(): number;
} {
	let count = 0;
	const counter = new Transform({
		transform(chunk, _enc, cb) {
			count += chunk.length;
			cb(null, chunk);
		},
	});
	source.pipe(counter);
	source.on('error', (err) => counter.destroy(err));
	return { stream: counter, getBytes: () => count };
}

/**
 * Read an SDK `GetObjectCommand` response body fully into an
 * `ArrayBuffer`. The SDK returns `unknown` for the body shape because
 * it varies by runtime; in Node it's an `IncomingMessage`-style
 * `Readable`.
 */
async function readBodyAsArrayBuffer(body: unknown): Promise<ArrayBuffer> {
	if (!body) return new ArrayBuffer(0);
	if (body instanceof Uint8Array) {
		// Some shapes return a Uint8Array directly. Copy into a fresh
		// ArrayBuffer so the return type is the strict ArrayBuffer rather
		// than ArrayBuffer | SharedArrayBuffer (which `.buffer` may be).
		const out = new Uint8Array(body.byteLength);
		out.set(body);
		return out.buffer;
	}
	if (isWebReadableStream(body)) {
		const reader = body.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
		return concatUint8Arrays(chunks).buffer;
	}
	// Otherwise treat as a Node Readable.
	const chunks: Buffer[] = [];
	for await (const chunk of body as Readable) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const merged = Buffer.concat(chunks);
	// Copy into a tightly-sized ArrayBuffer to avoid sharing the underlying
	// pool buffer with other Buffer instances.
	const out = new Uint8Array(merged.byteLength);
	out.set(merged);
	return out.buffer;
}

/**
 * Convert an SDK response body into a Web `ReadableStream<Uint8Array>`.
 * Returns an empty stream when the body is missing.
 */
function bodyToWebStream(body: unknown): ReadableStream<Uint8Array> {
	if (!body) {
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.close();
			},
		});
	}
	if (isWebReadableStream(body)) return body;
	if (body instanceof Uint8Array) {
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(body);
				controller.close();
			},
		});
	}
	// Assume Node Readable.
	return Readable.toWeb(body as Readable) as unknown as ReadableStream<Uint8Array>;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	let total = 0;
	for (const p of parts) total += p.byteLength;
	// Allocate against a concrete ArrayBuffer (not SharedArrayBuffer) so
	// the resulting `.buffer` is typed as ArrayBuffer.
	const out = new Uint8Array(new ArrayBuffer(total));
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.byteLength;
	}
	return out;
}

/**
 * Pull the leading hostname label off a virtual-hosted-style endpoint
 * URL. Falls back to `'bucket'` if parsing fails — which is fine
 * because the endpoint override controls actual routing; the SDK only
 * uses `Bucket` to construct path-style URLs (which we never do).
 */
function extractBucketLabel(endpoint: string): string {
	try {
		const url = new URL(endpoint);
		const firstLabel = url.hostname.split('.')[0];
		return firstLabel || 'bucket';
	} catch {
		return 'bucket';
	}
}
