import type {
	KeyValueStorage,
	ObjectStorage,
	StreamStorage,
	VectorStorage,
	DataResult,
	KeyValueStorageSetParams,
	KeyValueStats,
	KeyValueItemWithMetadata,
	ObjectResult,
	ObjectStorePutParams,
	CreatePublicURLParams,
	BucketInfo,
	ObjectInfo,
	Stream,
	StreamInfo,
	CreateStreamProps,
	ListStreamsParams,
	ListStreamsResponse,
	VectorUpsertParams,
	VectorUpsertResult,
	VectorResult,
	VectorSearchResultWithDocument,
	VectorSearchParams,
	VectorSearchResult,
	SessionEventProvider,
	SessionStartEvent,
	SessionCompleteEvent,
	EvalRunEventProvider,
	EvalRunStartEvent,
	EvalRunCompleteEvent,
} from '@agentuity/core';

export class CustomKeyValueStorage implements KeyValueStorage {
	async get<T>(_name: string, _key: string): Promise<DataResult<T>> {
		return {
			exists: true,
			data: { custom: 'kv-data' } as T,
			contentType: 'application/json',
		};
	}

	async set<T = unknown>(
		_name: string,
		_key: string,
		_value: T,
		_params?: KeyValueStorageSetParams
	): Promise<void> {
		// No-op
	}

	async delete(_name: string, _key: string): Promise<void> {
		// No-op
	}

	async getStats(_name: string): Promise<KeyValueStats> {
		return { sum: 0, count: 0 };
	}

	async getAllStats(): Promise<Record<string, KeyValueStats>> {
		return {};
	}

	async getNamespaces(): Promise<string[]> {
		return [];
	}

	async search<T = unknown>(
		_name: string,
		_keyword: string
	): Promise<Record<string, KeyValueItemWithMetadata<T>>> {
		return {};
	}

	async getKeys(_name: string): Promise<string[]> {
		return [];
	}

	async deleteNamespace(_name: string): Promise<void> {
		// No-op
	}

	async createNamespace(_name: string): Promise<void> {
		// No-op
	}
}

export class CustomObjectStorage implements ObjectStorage {
	async get(_bucket: string, _key: string): Promise<ObjectResult> {
		const data = new TextEncoder().encode('custom-object-data');
		return {
			exists: true,
			data,
			contentType: 'text/plain',
		};
	}

	async put(
		_bucket: string,
		_key: string,
		_data: Uint8Array | ArrayBuffer | ReadableStream,
		_params?: ObjectStorePutParams
	): Promise<void> {
		// No-op
	}

	async delete(_bucket: string, _key: string): Promise<boolean> {
		return true;
	}

	async createPublicURL(
		_bucket: string,
		_key: string,
		_params?: CreatePublicURLParams
	): Promise<string> {
		return 'https://custom.example.com/public-url';
	}

	async listBuckets(): Promise<BucketInfo[]> {
		return [];
	}

	async listKeys(_bucket: string): Promise<ObjectInfo[]> {
		return [];
	}

	async listObjects(
		_bucket: string,
		_options?: { prefix?: string; limit?: number }
	): Promise<ObjectInfo[]> {
		return [];
	}

	async headObject(_bucket: string, _key: string): Promise<ObjectInfo> {
		return {
			key: _key,
			size: 100,
			etag: 'custom-etag',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};
	}

	async deleteBucket(_bucket: string): Promise<boolean> {
		return true;
	}
}

export class CustomStreamStorage implements StreamStorage {
	async create(_name: string, _props?: CreateStreamProps): Promise<Stream> {
		const stream = new WritableStream();
		return Object.assign(stream, {
			id: 'custom-stream-id',
			url: 'https://custom.example.com/stream',
			bytesWritten: 0,
			compressed: false,
			write: async () => {},
			getReader: () => new ReadableStream(),
		});
	}

	async get(_id: string): Promise<StreamInfo> {
		return {
			id: 'custom-stream-1',
			name: 'custom-stream',
			metadata: {},
			url: 'https://custom.example.com/stream-1',
			sizeBytes: 0,
		};
	}

	async download(_id: string): Promise<ReadableStream<Uint8Array>> {
		return new ReadableStream();
	}

	async list(_params?: ListStreamsParams): Promise<ListStreamsResponse> {
		return {
			success: true,
			streams: [
				{
					id: 'custom-stream-1',
					name: 'custom-stream',
					metadata: {},
					url: 'https://custom.example.com/stream-1',
					sizeBytes: 0,
				},
			],
			total: 1,
		};
	}

	async delete(_id: string): Promise<void> {
		// No-op
	}
}

export class CustomVectorStorage implements VectorStorage {
	async upsert(_name: string, ..._documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]> {
		return [{ key: 'custom-key', id: 'custom-vector-id' }];
	}

	async get<T extends Record<string, unknown> = Record<string, unknown>>(
		_name: string,
		_key: string
	): Promise<VectorResult<T>> {
		return {
			exists: true,
			data: {
				id: 'custom-vector-id',
				key: 'custom-key',
				metadata: { custom: 'metadata' } as unknown as T,
				similarity: 0.95,
				embeddings: [0.1, 0.2, 0.3],
			},
		};
	}

	async getMany<T extends Record<string, unknown> = Record<string, unknown>>(
		_name: string,
		..._keys: string[]
	): Promise<Map<string, VectorSearchResultWithDocument<T>>> {
		return new Map([
			[
				'custom-key',
				{
					id: 'custom-vector-id',
					key: 'custom-key',
					similarity: 0.95,
					metadata: { custom: 'metadata' } as unknown as T,
					embeddings: [0.1, 0.2, 0.3],
				},
			],
		]);
	}

	async search<T extends Record<string, unknown> = Record<string, unknown>>(
		_name: string,
		_params: VectorSearchParams<T>
	): Promise<VectorSearchResult<T>[]> {
		return [
			{
				id: 'custom-vector-id',
				key: 'custom-key',
				similarity: 0.95,
				metadata: { custom: 'metadata' } as unknown as T,
			},
		];
	}

	async delete(_name: string, ..._keys: string[]): Promise<number> {
		return _keys.length;
	}

	async exists(_name: string): Promise<boolean> {
		return true;
	}
}

export class CustomSessionEventProvider implements SessionEventProvider {
	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(event: SessionStartEvent): Promise<void> {
		console.log(`SESSION START EVENT: ${JSON.stringify(event)}`);
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		console.log(`SESSION COMPLETE EVENT: ${JSON.stringify(event)}`);
	}
}

export class CustomEvalRunEventProvider implements EvalRunEventProvider {
	/**
	 * called when the eval run starts
	 *
	 * @param event EvalRunStartEvent
	 */
	async start(event: EvalRunStartEvent): Promise<void> {
		console.log(`EVAL RUN START EVENT: ${JSON.stringify(event)}`);
	}

	/**
	 * called when the eval run completes
	 *
	 * @param event EvalRunCompleteEvent
	 */
	async complete(event: EvalRunCompleteEvent): Promise<void> {
		console.log(`EVAL RUN COMPLETE EVENT: ${JSON.stringify(event)}`);
	}
}
