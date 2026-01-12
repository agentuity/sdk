import { FetchAdapter } from './adapter';
import { buildUrl, toServiceException } from './_util';
import { safeStringify } from '../json';
import { StructuredError } from '../error';

/**
 * Base properties shared by all vector upsert operations
 */
export interface VectorUpsertBase {
	/**
	 * the key of the vector object which can be used as a reference. the value of this key is opaque to the vector storage.
	 */
	key: string;

	/**
	 * the metadata to upsert
	 */
	metadata?: Record<string, unknown>;
}

/**
 * Upsert using pre-computed embeddings
 */
export interface VectorUpsertEmbeddings extends VectorUpsertBase {
	/**
	 * the embeddings to upsert
	 */
	embeddings: Array<number>;
	document?: never;
}

/**
 * Upsert using text that will be converted to embeddings
 */
export interface VectorUpsertText extends VectorUpsertBase {
	/**
	 * the text to use for the embedding
	 */
	document: string;
	embeddings?: never;
}

/**
 * Parameters for upserting a vector
 */
export type VectorUpsertParams = VectorUpsertEmbeddings | VectorUpsertText;

/**
 * Parameters for searching vectors
 */
export interface VectorSearchParams<T extends Record<string, unknown> = Record<string, unknown>> {
	/**
	 * The text query to search for in the vector storage. This will be converted to embeddings
	 * and used to find semantically similar documents.
	 *
	 * @example "comfortable office chair"
	 * @example "machine learning algorithms"
	 */
	query: string;

	/**
	 * Maximum number of search results to return. If not specified, the server default will be used.
	 * Must be a positive integer.
	 *
	 * @default 10
	 * @example 5
	 * @example 20
	 */
	limit?: number;

	/**
	 * Minimum similarity threshold for results. Only vectors with similarity scores greater than or equal
	 * to this value will be returned. Value must be between 0.0 and 1.0, where 1.0 means exact match
	 * and 0.0 means no similarity requirement.
	 *
	 * @minimum 0.0
	 * @maximum 1.0
	 * @example 0.7
	 * @example 0.5
	 */
	similarity?: number;

	/**
	 * Metadata filters to apply to the search. Only vectors whose metadata matches all specified
	 * key-value pairs will be included in results. Must be a valid JSON object if provided.
	 *
	 * @example { category: "furniture", inStock: true }
	 * @example { userId: "123", type: "product" }
	 */
	metadata?: T;
}

/**
 * Result of a vector search operation with optional type-safe metadata
 */
export interface VectorSearchResult<T extends Record<string, unknown> = Record<string, unknown>> {
	/**
	 * the unique id of the object in vector storage
	 */
	id: string;

	/**
	 * the key used when the vector object was added to vector storage
	 */
	key: string;

	/**
	 * the metadata of the vector object when it was stored
	 */
	metadata?: T;

	/**
	 * the distance of the vector object from the query from 0-1. The larger the number, the more similar the vector object is to the query.
	 */
	similarity: number;
}

/**
 * Extended search result that includes the document and embeddings
 */
export interface VectorSearchResultWithDocument<
	T extends Record<string, unknown> = Record<string, unknown>,
> extends VectorSearchResult<T> {
	/**
	 * the document that was used to create the vector object
	 */
	document?: string;

	/**
	 * the embeddings of the vector object
	 */
	embeddings?: Array<number>;
}

/**
 * Result of a vector upsert operation
 */
export interface VectorUpsertResult {
	/**
	 * the key from the original upsert document
	 */
	key: string;

	/**
	 * the generated id for this vector in storage
	 */
	id: string;
}

/**
 * Result when a vector is found by key
 */
export interface VectorResultFound<T extends Record<string, unknown> = Record<string, unknown>> {
	/**
	 * the vector data
	 */
	data: VectorSearchResultWithDocument<T>;

	/**
	 * the vector was found
	 */
	exists: true;
}

/**
 * Result when a vector is not found by key
 */
export interface VectorResultNotFound {
	/**
	 * no data available
	 */
	data: never;

	/**
	 * the vector was not found
	 */
	exists: false;
}

/**
 * Result of a get operation
 */
export type VectorResult<T extends Record<string, unknown> = Record<string, unknown>> =
	| VectorResultFound<T>
	| VectorResultNotFound;

/**
 * Statistics for a vector namespace
 */
export interface VectorNamespaceStats {
	/**
	 * Total size in bytes
	 */
	sum: number;

	/**
	 * Number of vectors in the namespace
	 */
	count: number;

	/**
	 * Unix timestamp (milliseconds) when the namespace was created
	 */
	createdAt?: number;

	/**
	 * Unix timestamp (milliseconds) when the namespace was last used
	 */
	lastUsed?: number;
}

/**
 * Statistics for an individual vector item
 */
export interface VectorItemStats {
	/**
	 * The embedding vector
	 */
	embedding?: number[];

	/**
	 * The original document text
	 */
	document?: string;

	/**
	 * Size in bytes
	 */
	size: number;

	/**
	 * Metadata associated with the vector
	 */
	metadata?: Record<string, unknown>;

	/**
	 * Unix timestamp (milliseconds) when the vector was first accessed
	 */
	firstUsed: number;

	/**
	 * Unix timestamp (milliseconds) when the vector was last accessed
	 */
	lastUsed: number;

	/**
	 * Number of times the vector was accessed.
	 * Note: This is only tracked in cloud storage; local development returns undefined.
	 */
	count?: number;
}

/**
 * Namespace statistics with sampled vector results
 */
export interface VectorNamespaceStatsWithSamples extends VectorNamespaceStats {
	/**
	 * A sample of vectors in the namespace (up to 20)
	 */
	sampledResults?: Record<string, VectorItemStats>;
}

/**
 * Vector storage service for managing vector embeddings and semantic search
 */
export interface VectorStorage {
	/**
	 * Upsert vectors into the vector storage. You can provide either pre-computed embeddings
	 * or text documents that will be automatically embedded.
	 *
	 * @param name - the name of the vector storage namespace
	 * @param documents - one or more documents to upsert
	 * @returns array of results with key-to-id mappings for the upserted vectors
	 *
	 * @example
	 * ```typescript
	 * // Upsert with automatic embedding
	 * const results = await vectorStore.upsert('products',
	 *   {
	 *     key: 'chair-001',
	 *     document: 'Comfortable office chair with lumbar support',
	 *     metadata: { category: 'furniture', price: 299 }
	 *   },
	 *   {
	 *     key: 'desk-001',
	 *     document: 'Standing desk with adjustable height',
	 *     metadata: { category: 'furniture', price: 599 }
	 *   }
	 * );
	 *
	 * // Upsert with pre-computed embeddings
	 * await vectorStore.upsert('products', {
	 *   key: 'lamp-001',
	 *   embeddings: [0.1, 0.2, 0.3, ...], // Your pre-computed vector
	 *   metadata: { category: 'lighting', price: 49 }
	 * });
	 * ```
	 */
	upsert(name: string, ...documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]>;

	/**
	 * Get a single vector by its key
	 *
	 * @param name - the name of the vector storage namespace
	 * @param key - the key of the vector to retrieve
	 * @returns VectorResult with exists field for type-safe checking
	 *
	 * @example
	 * ```typescript
	 * const result = await vectorStore.get('products', 'chair-001');
	 * if (result.exists) {
	 *   console.log('Found:', result.data.metadata);
	 *   console.log('Embeddings:', result.data.embeddings);
	 * }
	 * ```
	 */
	get<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		key: string
	): Promise<VectorResult<T>>;

	/**
	 * Get multiple vectors by their keys in a single request
	 *
	 * @param name - the name of the vector storage namespace
	 * @param keys - the keys of the vectors to retrieve
	 * @returns a Map of key to vector data (only includes found vectors)
	 *
	 * @example
	 * ```typescript
	 * const vectors = await vectorStore.getMany('products', 'chair-001', 'desk-001', 'lamp-001');
	 * for (const [key, data] of vectors) {
	 *   console.log(`${key}:`, data.metadata);
	 * }
	 * ```
	 */
	getMany<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		...keys: string[]
	): Promise<Map<string, VectorSearchResultWithDocument<T>>>;

	/**
	 * Search for semantically similar vectors using natural language queries
	 *
	 * @param name - the name of the vector storage namespace
	 * @param params - search parameters including query, filters, and limits
	 * @returns array of search results ordered by similarity (highest first)
	 *
	 * @example
	 * ```typescript
	 * // Basic semantic search
	 * const results = await vectorStore.search('products', {
	 *   query: 'comfortable seating for office',
	 *   limit: 5
	 * });
	 *
	 * // Search with metadata filters and similarity threshold
	 * const filteredResults = await vectorStore.search('products', {
	 *   query: 'ergonomic furniture',
	 *   limit: 10,
	 *   similarity: 0.7, // Only results with 70%+ similarity
	 *   metadata: { category: 'furniture', inStock: true }
	 * });
	 *
	 * for (const result of filteredResults) {
	 *   console.log(`${result.key}: ${result.similarity * 100}% match`);
	 *   console.log('Metadata:', result.metadata);
	 * }
	 * ```
	 */
	search<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		params: VectorSearchParams<T>
	): Promise<VectorSearchResult<T>[]>;

	/**
	 * Delete one or more vectors by their keys
	 *
	 * @param name - the name of the vector storage namespace
	 * @param keys - one or more keys of vectors to delete
	 * @returns the number of vectors that were deleted
	 *
	 * @example
	 * ```typescript
	 * // Delete a single vector
	 * const deleted = await vectorStore.delete('products', 'chair-001');
	 * console.log(`Deleted ${deleted} vector(s)`);
	 *
	 * // Delete multiple vectors
	 * await vectorStore.delete('products', 'chair-001', 'desk-001', 'lamp-001');
	 * ```
	 */
	delete(name: string, ...keys: string[]): Promise<number>;

	/**
	 * Check if a vector storage namespace exists
	 *
	 * @param name - the name of the vector storage namespace
	 * @returns true if the namespace exists, false otherwise
	 *
	 * @example
	 * ```typescript
	 * if (await vectorStore.exists('products')) {
	 *   console.log('Products namespace exists');
	 * }
	 * ```
	 */
	exists(name: string): Promise<boolean>;

	/**
	 * Get statistics for a specific namespace including sampled results
	 *
	 * @param name - the name of the vector storage namespace
	 * @returns statistics for the namespace with sampled vector results
	 *
	 * @example
	 * ```typescript
	 * const stats = await vectorStore.getStats('products');
	 * console.log(`Namespace has ${stats.count} vectors (${stats.sum} bytes)`);
	 * if (stats.sampledResults) {
	 *   for (const [key, item] of Object.entries(stats.sampledResults)) {
	 *     console.log(`${key}: ${item.size} bytes, accessed ${item.count} times`);
	 *   }
	 * }
	 * ```
	 */
	getStats(name: string): Promise<VectorNamespaceStatsWithSamples>;

	/**
	 * Get statistics for all namespaces in the organization
	 *
	 * @returns map of namespace names to their statistics
	 *
	 * @example
	 * ```typescript
	 * const allStats = await vectorStore.getAllStats();
	 * for (const [name, stats] of Object.entries(allStats)) {
	 *   console.log(`${name}: ${stats.count} vectors, ${stats.sum} bytes`);
	 * }
	 * ```
	 */
	getAllStats(): Promise<Record<string, VectorNamespaceStats>>;

	/**
	 * Get all namespace names
	 *
	 * @returns array of namespace names
	 *
	 * @example
	 * ```typescript
	 * const namespaces = await vectorStore.getNamespaces();
	 * console.log('Namespaces:', namespaces.join(', '));
	 * ```
	 */
	getNamespaces(): Promise<string[]>;

	/**
	 * Delete an entire namespace and all its vectors
	 *
	 * @param name - the name of the vector storage namespace to delete
	 *
	 * @example
	 * ```typescript
	 * await vectorStore.deleteNamespace('old-products');
	 * console.log('Namespace deleted');
	 * ```
	 */
	deleteNamespace(name: string): Promise<void>;
}

interface VectorUpsertSuccessResponse {
	success: true;
	data: Array<{ id: string }>;
}

interface VectorUpsertErrorResponse {
	success: false;
	message: string;
}

type VectorUpsertResponse = VectorUpsertSuccessResponse | VectorUpsertErrorResponse;

interface VectorGetSuccessResponse {
	success: true;
	data: VectorSearchResultWithDocument | null;
}

interface VectorGetErrorResponse {
	success: false;
	message: string;
}

type VectorGetResponse = VectorGetSuccessResponse | VectorGetErrorResponse;

interface VectorSearchSuccessResponse {
	success: true;
	data: VectorSearchResult[];
}

interface VectorSearchErrorResponse {
	success: false;
	message: string;
}

type VectorSearchResponse = VectorSearchSuccessResponse | VectorSearchErrorResponse;

interface VectorDeleteSuccessResponse {
	success: true;
	data: number;
}

interface VectorDeleteErrorResponse {
	success: false;
	message: string;
}

type VectorDeleteResponse = VectorDeleteSuccessResponse | VectorDeleteErrorResponse;

type VectorStatsResponse = VectorNamespaceStatsWithSamples;

type VectorAllStatsResponse = Record<string, VectorNamespaceStats>;

interface VectorDeleteNamespaceSuccessResponse {
	success: true;
	data: number;
}

interface VectorDeleteNamespaceErrorResponse {
	success: false;
	message: string;
}

type VectorDeleteNamespaceResponse =
	| VectorDeleteNamespaceSuccessResponse
	| VectorDeleteNamespaceErrorResponse;

const VectorStorageNameRequiredError = StructuredError(
	'VectorStorageNameRequiredError',
	'Vector storage name is required and must be a non-empty string'
);

const VectorStorageKeyRequiredError = StructuredError(
	'VectorStorageKeyRequiredError',
	'Vector storage key is required and must be a non-empty string'
);

const VectorStorageKeysError = StructuredError(
	'VectorStorageKeysError',
	'Vector storage requires all keys to be non-empty strings'
);

const VectorStorageQueryError = StructuredError(
	'VectorStorageQueryError',
	'Vector storage query property is required and must be a non-empty string'
);

const VectorStorageLimitError = StructuredError(
	'VectorStorageLimitError',
	'Vector storage limit property must be positive number'
);

const VectorStorageSimilarityError = StructuredError(
	'VectorStorageSimilarityError',
	'Vector storage similarity property must be a number between 0.0 and 1.0'
);

const VectorStorageMetadataError = StructuredError(
	'VectorStorageMetadataError',
	'Vector storage metadata property must be a valid object'
);

const VectorStorageDocumentRequiredError = StructuredError(
	'VectorStorageDocumentRequiredError',
	'Vector storage requires at least one document for this method'
);

const VectorStorageDocumentKeyMissingError = StructuredError(
	'VectorStorageDocumentKeyMissingError',
	'Vector storage requires each document to have a non-empty key'
);

const VectorStorageInvalidError = StructuredError(
	'VectorStorageInvalidError',
	'Vector storage requires each document to have either embeddings or document property'
);

const VectorStorageEmbeddingInvalidError = StructuredError(
	'VectorStorageEmbeddingInvalidError',
	'Vector storage requires each embeddings property to have a non-empty array of numbers'
);

const VectorStorageDocumentInvalidError = StructuredError(
	'VectorStorageDocumentInvalidError',
	'Vector storage requires each document property to have a non-empty string value'
);

const VectorStorageResponseError = StructuredError('VectorStorageResponseError')<{
	status: number;
}>();

export class VectorStorageService implements VectorStorage {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async upsert(name: string, ...documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		if (!documents || documents.length === 0) {
			throw new VectorStorageDocumentRequiredError();
		}

		for (const doc of documents) {
			if (!doc.key || typeof doc.key !== 'string' || doc.key.trim().length === 0) {
				throw new VectorStorageDocumentKeyMissingError();
			}

			if (!('embeddings' in doc) && !('document' in doc)) {
				throw new VectorStorageInvalidError();
			}

			if ('embeddings' in doc && doc.embeddings) {
				if (!Array.isArray(doc.embeddings) || doc.embeddings.length === 0) {
					throw new VectorStorageEmbeddingInvalidError();
				}
			}

			if ('document' in doc && doc.document) {
				if (typeof doc.document !== 'string' || doc.document.trim().length === 0) {
					throw new VectorStorageDocumentInvalidError();
				}
			}
		}

		const url = buildUrl(this.#baseUrl, `/vector/2025-03-17/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<VectorUpsertResponse>(url, {
			method: 'PUT',
			body: safeStringify(documents),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.vector.upsert',
				attributes: {
					name,
					count: String(documents.length),
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data.map((o, index) => ({
					key: documents[index].key,
					id: o.id,
				}));
			}
			throw new VectorStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('PUT', url, res.response);
	}

	async get<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		key: string
	): Promise<VectorResult<T>> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		if (!key || typeof key !== 'string' || key.trim().length === 0) {
			throw new VectorStorageKeyRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/vector/2025-03-17/${encodeURIComponent(name)}/${encodeURIComponent(key)}`
		);
		const signal = AbortSignal.timeout(10_000);

		const res = await this.#adapter.invoke<VectorGetResponse>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.vector.get',
				attributes: {
					name,
					key,
				},
			},
		});

		if (res.response.status === 404) {
			return { exists: false } as VectorResultNotFound;
		}

		if (res.ok) {
			if (res.data.success) {
				return {
					data: res.data.data as VectorSearchResultWithDocument<T>,
					exists: true,
				};
			}
			throw new VectorStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	async getMany<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		...keys: string[]
	): Promise<Map<string, VectorSearchResultWithDocument<T>>> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		if (keys.length === 0) {
			return new Map();
		}

		for (const key of keys) {
			if (!key || typeof key !== 'string' || key.trim().length === 0) {
				throw new VectorStorageKeysError();
			}
		}

		const results = await Promise.all(keys.map((key) => this.get<T>(name, key)));

		const resultMap = new Map<string, VectorSearchResultWithDocument<T>>();
		results.forEach((result, index) => {
			if (result.exists) {
				resultMap.set(keys[index], result.data);
			}
		});

		return resultMap;
	}

	async search<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		params: VectorSearchParams<T>
	): Promise<VectorSearchResult<T>[]> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
			throw new VectorStorageQueryError();
		}

		if (params.limit !== undefined) {
			if (typeof params.limit !== 'number' || params.limit <= 0) {
				throw new VectorStorageLimitError();
			}
		}

		if (params.similarity !== undefined) {
			if (
				typeof params.similarity !== 'number' ||
				params.similarity < 0 ||
				params.similarity > 1
			) {
				throw new VectorStorageSimilarityError();
			}
		}

		if (params.metadata !== undefined) {
			if (typeof params.metadata !== 'object' || params.metadata === null) {
				throw new VectorStorageMetadataError();
			}
		}

		const url = buildUrl(this.#baseUrl, `/vector/2025-03-17/search/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(30_000);

		const attributes: Record<string, string> = {
			name,
			query: params.query,
		};
		if (params.limit !== undefined) {
			attributes.limit = String(params.limit);
		}
		if (params.similarity !== undefined) {
			attributes.similarity = String(params.similarity);
		}

		const res = await this.#adapter.invoke<VectorSearchResponse>(url, {
			method: 'POST',
			body: safeStringify(params),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.vector.search',
				attributes,
			},
		});

		if (res.response.status === 404) {
			return [];
		}

		if (res.ok) {
			if (res.data.success) {
				return res.data.data as VectorSearchResult<T>[];
			}
			throw new VectorStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('POST', url, res.response);
	}

	async delete(name: string, ...keys: string[]): Promise<number> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		if (keys.length === 0) {
			return 0;
		}

		for (const key of keys) {
			if (!key || typeof key !== 'string' || key.trim().length === 0) {
				throw new VectorStorageKeysError();
			}
		}

		const signal = AbortSignal.timeout(30_000);
		let url: string;
		let body: string | undefined;

		if (keys.length === 1) {
			url = buildUrl(
				this.#baseUrl,
				`/vector/2025-03-17/${encodeURIComponent(name)}/${encodeURIComponent(keys[0])}`
			);
		} else {
			url = buildUrl(this.#baseUrl, `/vector/2025-03-17/${encodeURIComponent(name)}`);
			body = safeStringify({ keys });
		}

		const res = await this.#adapter.invoke<VectorDeleteResponse>(url, {
			method: 'DELETE',
			...(body && { body, contentType: 'application/json' }),
			signal,
			telemetry: {
				name: 'agentuity.vector.delete',
				attributes: {
					name,
					count: String(keys.length),
				},
			},
		});

		// Treat missing vectors as non-fatal for idempotency, like get()/search()
		if (res.response.status === 404) {
			return 0;
		}

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new VectorStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	async exists(name: string): Promise<boolean> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		const stats = await this.getStats(name);
		return stats.count > 0;
	}

	async getStats(name: string): Promise<VectorNamespaceStatsWithSamples> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		const url = buildUrl(this.#baseUrl, `/vector/2025-03-17/stats/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(10_000);

		const res = await this.#adapter.invoke<VectorStatsResponse>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.vector.getStats',
				attributes: {
					name,
				},
			},
		});

		if (res.ok) {
			return res.data;
		}

		if (res.response.status === 404) {
			return { sum: 0, count: 0 };
		}

		throw await toServiceException('GET', url, res.response);
	}

	async getAllStats(): Promise<Record<string, VectorNamespaceStats>> {
		const url = buildUrl(this.#baseUrl, '/vector/2025-03-17/stats');
		const signal = AbortSignal.timeout(10_000);

		const res = await this.#adapter.invoke<VectorAllStatsResponse>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.vector.getAllStats',
				attributes: {},
			},
		});

		if (res.ok) {
			return res.data;
		}

		throw await toServiceException('GET', url, res.response);
	}

	async getNamespaces(): Promise<string[]> {
		const stats = await this.getAllStats();
		return Object.keys(stats);
	}

	async deleteNamespace(name: string): Promise<void> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new VectorStorageNameRequiredError();
		}

		const url = buildUrl(this.#baseUrl, `/vector/2025-03-17/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<VectorDeleteNamespaceResponse>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.vector.deleteNamespace',
				attributes: {
					name,
				},
			},
		});

		if (res.response.status === 404) {
			return;
		}

		if (res.ok) {
			if (res.data.success) {
				return;
			}
			throw new VectorStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('DELETE', url, res.response);
	}
}
