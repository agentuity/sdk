/**
 * Mock service implementations for unit testing.
 *
 * These provide in-memory implementations that behave like real Agentuity services
 * but don't require external infrastructure (Redis, PostgreSQL, S3, etc.).
 *
 * All mock services are automatically created in TestAgentContext, but you can also
 * use them directly for more control.
 *
 * @module mock-services
 */

import type {
	KeyValueStorage,
	StreamStorage,
	VectorStorage,
	DataResult,
	VectorUpsertParams,
	VectorUpsertResult,
	VectorResult,
	VectorSearchParams,
	VectorSearchResult,
	VectorSearchResultWithDocument,
	KeyValueStats,
	Stream,
	ListStreamsResponse,
	CreateStreamProps,
} from '@agentuity/core';

/**
 * Create a mock KeyValueStorage implementation with in-memory Map-based storage.
 */
export function createMockKeyValueStorage(): KeyValueStorage {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const stores = new Map<string, Map<string, any>>();

	return {
		async set(store: string, key: string, value: unknown, _options?: { ttl?: number }) {
			if (!stores.has(store)) {
				stores.set(store, new Map());
			}
			stores.get(store)!.set(key, value);
		},

		async get<T>(name: string, key: string): Promise<DataResult<T>> {
			const storeData = stores.get(name);
			if (!storeData || !storeData.has(key)) {
				return { exists: false, data: undefined as never };
			}
			return {
				exists: true,
				data: storeData.get(key) as T,
				contentType: 'application/json',
			};
		},

		async delete(store: string, key: string) {
			const storeData = stores.get(store);
			if (storeData) {
				storeData.delete(key);
			}
		},

		async getKeys(store: string) {
			const storeData = stores.get(store);
			if (!storeData) return [];
			return Array.from(storeData.keys());
		},

		async search(store: string, keyword: string) {
			const storeData = stores.get(store);
			if (!storeData) return {};

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const results: Record<string, any> = {};
			for (const [key, value] of storeData.entries()) {
				if (key.includes(keyword) || JSON.stringify(value).includes(keyword)) {
					results[key] = value;
				}
			}
			return results;
		},

		async getStats(name: string): Promise<KeyValueStats> {
			const storeData = stores.get(name);
			return {
				sum: 0,
				count: storeData?.size ?? 0,
			};
		},

		async getNamespaces() {
			return Array.from(stores.keys());
		},

		async getAllStats() {
			const stats: Record<string, KeyValueStats> = {};
			for (const name of stores.keys()) {
				const storeData = stores.get(name);
				stats[name] = {
					sum: 0,
					count: storeData?.size ?? 0,
				};
			}
			return stats;
		},

		async deleteNamespace(name: string) {
			stores.delete(name);
		},

		async createNamespace(_name: string) {
			// No-op for mock
		},
	};
}

/**
 * Create a mock StreamStorage implementation.
 */
export function createMockStreamStorage(): StreamStorage {
	const streams = new Map<
		string,
		{
			id: string;
			url: string;
			contentType: string;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			metadata: any;
			data: Uint8Array[];
		}
	>();

	return {
		async create(name: string, props?: CreateStreamProps): Promise<Stream> {
			const id = `stream-${Date.now()}`;
			const url = `https://mock-stream.local/${id}`;

			const streamData = {
				id,
				url,
				contentType: props?.contentType ?? 'application/octet-stream',
				metadata: props?.metadata ?? {},
				data: [] as Uint8Array[],
			};

			streams.set(id, streamData);

			let bytesWritten = 0;
			let closed = false;

			const mockStream: Stream = {
				id,
				url,
				get bytesWritten() {
					return bytesWritten;
				},
				get compressed() {
					return props?.compress ?? false;
				},
				async write(chunk: string | Uint8Array | ArrayBuffer | object) {
					if (closed) {
						throw new Error('Stream is closed');
					}
					let bytes: Uint8Array;
					if (typeof chunk === 'string') {
						bytes = new TextEncoder().encode(chunk);
					} else if (chunk instanceof ArrayBuffer) {
						bytes = new Uint8Array(chunk);
					} else if (chunk instanceof Uint8Array) {
						bytes = chunk;
					} else {
						bytes = new TextEncoder().encode(JSON.stringify(chunk));
					}
					streamData.data.push(bytes);
					bytesWritten += bytes.length;
				},
				async close() {
					closed = true;
				},
				getReader() {
					return new ReadableStream<Uint8Array>({
						start(controller) {
							for (const chunk of streamData.data) {
								controller.enqueue(chunk);
							}
							if (closed) {
								controller.close();
							}
						},
					});
				},
				locked: false,
				async abort() {},
				getWriter() {
					throw new Error('Not implemented');
				},
			};

			return mockStream;
		},

		async get() {
			throw new Error('Not implemented');
		},

		async list(params?: { limit?: number }): Promise<ListStreamsResponse> {
			const streamArray = Array.from(streams.values()).slice(0, params?.limit ?? 100);
			return {
				success: true,
				streams: streamArray.map((s) => ({
					id: s.id,
					name: s.id,
					url: s.url,
					metadata: s.metadata,
					sizeBytes: s.data.reduce((sum, chunk) => sum + chunk.length, 0),
				})),
				total: streams.size,
			};
		},

		async download(_id: string) {
			return new ReadableStream<Uint8Array>();
		},

		async delete(_id: string) {
			// No-op for mock
		},
	};
}

/**
 * Create a mock VectorStorage implementation.
 */
export function createMockVectorStorage(): VectorStorage {
	const stores = new Map<
		string,
		Map<
			string,
			{
				key: string;
				vector: number[];
				document: string | null;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				metadata: any;
			}
		>
	>();

	return {
		async upsert(
			name: string,
			...documents: VectorUpsertParams[]
		): Promise<VectorUpsertResult[]> {
			if (!stores.has(name)) {
				stores.set(name, new Map());
			}
			const store = stores.get(name)!;

			const results: VectorUpsertResult[] = [];
			for (const doc of documents) {
				const vector =
					'embeddings' in doc && doc.embeddings
						? doc.embeddings
						: [Math.random(), Math.random(), Math.random()];
				const document = 'document' in doc && doc.document ? doc.document : null;

				store.set(doc.key, {
					key: doc.key,
					vector,
					document,
					metadata: doc.metadata ?? {},
				});

				results.push({
					key: doc.key,
					id: `vec-${doc.key}`,
				});
			}

			return results;
		},

		async get<T extends Record<string, unknown> = Record<string, unknown>>(
			name: string,
			key: string
		): Promise<VectorResult<T>> {
			const store = stores.get(name);
			if (!store || !store.has(key)) {
				return { exists: false, data: undefined as never };
			}
			const vec = store.get(key)!;
			return {
				exists: true,
				data: {
					id: `vec-${key}`,
					key: vec.key,
					metadata: vec.metadata as T,
					similarity: 1.0,
					document: vec.document ?? undefined,
					embeddings: vec.vector,
				},
			};
		},

		async getMany<T extends Record<string, unknown> = Record<string, unknown>>(
			name: string,
			...keys: string[]
		): Promise<Map<string, VectorSearchResultWithDocument<T>>> {
			const results = new Map<string, VectorSearchResultWithDocument<T>>();
			const store = stores.get(name);
			if (!store) return results;

			for (const key of keys) {
				if (store.has(key)) {
					const vec = store.get(key)!;
					results.set(key, {
						id: `vec-${key}`,
						key: vec.key,
						metadata: vec.metadata as T,
						similarity: 1.0,
						document: vec.document ?? undefined,
						embeddings: vec.vector,
					});
				}
			}
			return results;
		},

		async search<T extends Record<string, unknown> = Record<string, unknown>>(
			name: string,
			params: VectorSearchParams<T>
		): Promise<VectorSearchResult<T>[]> {
			const store = stores.get(name);
			if (!store) return [];

			const results: VectorSearchResult<T>[] = [];
			for (const [, vec] of store.entries()) {
				// Simple metadata matching
				if (params.metadata) {
					let matches = true;
					for (const [key, value] of Object.entries(params.metadata)) {
						if (vec.metadata[key] !== value) {
							matches = false;
							break;
						}
					}
					if (!matches) continue;
				}

				results.push({
					id: `vec-${vec.key}`,
					key: vec.key,
					metadata: vec.metadata as T,
					similarity: Math.random() * 0.5 + 0.5, // Random similarity 0.5-1.0
				});
			}

			// Sort by similarity and apply limit
			results.sort((a, b) => b.similarity - a.similarity);
			if (params.limit) {
				return results.slice(0, params.limit);
			}
			return results;
		},

		async delete(name: string, ...keys: string[]): Promise<number> {
			const store = stores.get(name);
			if (!store) return 0;

			let count = 0;
			for (const key of keys) {
				if (store.delete(key)) {
					count++;
				}
			}
			return count;
		},

		async exists(name: string) {
			return stores.has(name);
		},
	};
}
