import type {
	KeyValueStorage,
	ObjectStorage,
	StreamStorage,
	VectorStorage,
	DataResult,
	KeyValueStorageSetParams,
	ObjectResult,
	ObjectStorePutParams,
	CreatePublicURLParams,
	Stream,
	CreateStreamProps,
	ListStreamsParams,
	ListStreamsResponse,
	VectorUpsertParams,
	VectorUpsertResult,
	VectorResult,
	VectorSearchResultWithDocument,
	VectorSearchParams,
	VectorSearchResult,
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
