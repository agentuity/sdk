import { FetchAdapter } from './adapter.ts';
import { buildUrl, toServiceException, toPayload } from './_util.ts';
import type { SortDirection } from './pagination.ts';

/**
 * Minimum TTL value in seconds (1 minute)
 */
export const KV_MIN_TTL_SECONDS = 60;

/**
 * Maximum TTL value in seconds (90 days)
 */
export const KV_MAX_TTL_SECONDS = 7776000;

/**
 * Default TTL value in seconds (7 days) - used when namespace is auto-created or no TTL specified
 */
export const KV_DEFAULT_TTL_SECONDS = 604800;

/**
 * the result of a data operation when the data is found
 */
export interface DataResultFound<T> {
	/**
	 * the data from the result of the operation
	 */
	data: T;

	/**
	 * the content type of the data
	 */
	contentType: string;

	/**
	 * the data was found
	 */
	exists: true;

	/**
	 * the expiration time of the data as an ISO 8601 timestamp.
	 * undefined if the key does not expire.
	 */
	expiresAt?: string;
}

/**
 * the result of a data operation when the data is not found
 */
export interface DataResultNotFound {
	data: never;
	/**
	 * the data was not found
	 */
	exists: false;
}

/**
 * the result of a data operation
 */
export type DataResult<T> = DataResultFound<T> | DataResultNotFound;

export interface KeyValueStorageSetParams {
	/**
	 * Time-to-live in seconds for the key. Controls when the key expires and is automatically deleted.
	 * - `undefined` (not provided): Key inherits the namespace's default TTL (7 days if not configured)
	 * - `null` or `0`: Key never expires
	 * - positive number (≥60): Key expires after the specified number of seconds (max 90 days)
	 *
	 * @remarks
	 * TTL values below 60 seconds are clamped to 60 seconds by the server.
	 * TTL values above 7,776,000 seconds (90 days) are clamped to 90 days.
	 */
	ttl?: number | null;
	/**
	 * the content type of the value
	 */
	contentType?: string;
}

/**
 * Parameters for creating a namespace
 */
export interface CreateNamespaceParams {
	/**
	 * Default TTL for keys in this namespace (in seconds).
	 * - If undefined/omitted: uses server default (7 days / 604,800 seconds)
	 * - If 0: keys will not expire by default
	 * - If 60-7,776,000: custom TTL in seconds (1 minute to 90 days)
	 *
	 * Keys can override this default by specifying TTL in the set() call.
	 * Active keys are automatically extended (sliding expiration) when read
	 * if their remaining TTL is less than 50% of the original TTL.
	 */
	defaultTTLSeconds?: number;
}

/**
 * Statistics for a key-value store namespace
 */
export interface KeyValueStats {
	sum: number;
	count: number;
	createdAt?: number;
	lastUsedAt?: number;
}

/**
 * Item with metadata from search results
 */
export interface KeyValueItemWithMetadata<T = unknown> {
	value: T;
	contentType: string;
	contentEncoding?: string | null;
	size: number;
	expiresAt?: string | null;
	firstUsed?: number | null;
	lastUsed?: number | null;
	count?: number | null;
}

export type KVSortField = 'name' | 'size' | 'records' | 'created' | 'lastUsed';

/**
 * Parameters for getting all namespace statistics with optional pagination
 */
export interface GetAllStatsParams {
	/**
	 * Filter namespaces by name substring
	 */
	name?: string;
	/**
	 * Maximum number of namespaces to return (default: 100, max: 1000)
	 */
	limit?: number;
	/**
	 * Number of namespaces to skip for pagination (default: 0)
	 */
	offset?: number;
	/**
	 * Field to sort by
	 */
	sort?: KVSortField;
	/**
	 * Sort direction (default: 'desc')
	 */
	direction?: SortDirection;
	/**
	 * Filter by project ID
	 */
	projectId?: string;
	/**
	 * Filter by agent ID
	 */
	agentId?: string;
	/**
	 * Filter by project name
	 */
	projectName?: string;
	/**
	 * Filter by agent name
	 */
	agentName?: string;
}

/**
 * Paginated response for namespace statistics
 */
export interface KeyValueStatsPaginated {
	/**
	 * Map of namespace names to their statistics
	 */
	namespaces: Record<string, KeyValueStats>;
	/**
	 * Total number of namespaces across all pages
	 */
	total: number;
	/**
	 * Number of namespaces requested per page
	 */
	limit: number;
	/**
	 * Number of namespaces skipped
	 */
	offset: number;
	/**
	 * Whether there are more namespaces available
	 */
	hasMore: boolean;
}

export interface KeyValueStorage {
	/**
	 * get a value from the key value storage
	 *
	 * @param name - the name of the key value storage
	 * @param key - the key to get the value of
	 * @returns the DataResult object
	 */
	get<T>(name: string, key: string): Promise<DataResult<T>>;

	/**
	 * set a value in the key value storage
	 *
	 * @param name - the name of the key value storage
	 * @param key - the key to set the value of
	 * @param value - the value to set in any of the supported data types
	 * @param params - the KeyValueStorageSetParams
	 */
	set<T = unknown>(
		name: string,
		key: string,
		value: T,
		params?: KeyValueStorageSetParams
	): Promise<void>;

	/**
	 * delete a value from the key value storage
	 *
	 * @param name - the name of the key value storage
	 * @param key - the key to delete
	 */
	delete(name: string, key: string): Promise<void>;

	/**
	 * get statistics for a specific namespace
	 *
	 * @param name - the name of the key value storage
	 * @returns statistics for the namespace
	 */
	getStats(name: string): Promise<KeyValueStats>;

	/**
	 * get statistics for all namespaces
	 *
	 * @param params - optional pagination parameters
	 * @returns map of namespace names to statistics, or paginated response if params provided
	 */
	getAllStats(
		params?: GetAllStatsParams
	): Promise<Record<string, KeyValueStats> | KeyValueStatsPaginated>;

	/**
	 * get all namespace names
	 *
	 * @returns array of namespace names (up to 1000)
	 *
	 * @remarks
	 * This method returns a maximum of 1000 namespace names.
	 * If you have more than 1000 namespaces, only the first 1000
	 * (ordered by creation date, most recent first) will be returned.
	 */
	getNamespaces(): Promise<string[]>;

	/**
	 * search for keys matching a keyword
	 *
	 * @param name - the name of the key value storage
	 * @param keyword - the keyword to search for
	 * @returns map of keys to items with metadata
	 */
	search<T = unknown>(
		name: string,
		keyword: string
	): Promise<Record<string, KeyValueItemWithMetadata<T>>>;

	/**
	 * get all keys in a namespace
	 *
	 * @param name - the name of the key value storage
	 * @returns array of keys
	 */
	getKeys(name: string): Promise<string[]>;

	/**
	 * delete all keys in a namespace
	 *
	 * @param name - the name of the key value storage
	 */
	deleteNamespace(name: string): Promise<void>;

	/**
	 * create a new namespace
	 *
	 * @param name - the name of the key value storage to create
	 * @param params - optional parameters including default TTL
	 */
	createNamespace(name: string, params?: CreateNamespaceParams): Promise<void>;
}

/**
 * Decodes a base64 string to a Uint8Array.
 */
function base64ToBytes(base64: string): Uint8Array {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

/**
 * Deserializes search result values from the server's wire format.
 *
 * The Go server stores values as []byte, which Go's json.Marshal
 * base64-encodes when embedding in a JSON response. This function
 * decodes each item's value from base64 and parses it according
 * to its contentType, aligning search() behavior with get().
 */
function deserializeSearchResults<T>(
	data: Record<string, KeyValueItemWithMetadata<T>>
): Record<string, KeyValueItemWithMetadata<T>> {
	for (const item of Object.values(data)) {
		if (typeof item.value === 'string') {
			try {
				const bytes = base64ToBytes(item.value);
				const ct = (item.contentType ?? '').toLowerCase();

				if (ct.includes('json')) {
					const text = new TextDecoder().decode(bytes);
					item.value = JSON.parse(text) as T;
				} else if (ct.startsWith('text/')) {
					item.value = new TextDecoder().decode(bytes) as T;
				} else {
					item.value = bytes.buffer as T;
				}
			} catch {
				// If base64 decoding or parsing fails, leave value as-is
			}
		}
	}
	return data;
}

export class KeyValueStorageService implements KeyValueStorage {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async get<T>(name: string, key: string): Promise<DataResult<T>> {
		const url = buildUrl(
			this.#baseUrl,
			`/kv/${encodeURIComponent(name)}/${encodeURIComponent(key)}`
		);
		const signal = AbortSignal.timeout(30_000); // 30s timeout for Neon cold starts
		const res = await this.#adapter.invoke<T>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.get',
				attributes: {
					name,
					key,
				},
			},
		});
		if (res.ok) {
			const expiresAt = res.response.headers.get('x-expires-at') ?? undefined;
			return {
				data: res.data,
				contentType: res.response.headers.get('content-type') ?? 'application/octet-stream',
				exists: true,
				...(expiresAt && { expiresAt }),
			};
		}
		if (res.response.status === 404) {
			return { exists: false } as DataResultNotFound;
		}
		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * set a value in the key value storage
	 *
	 * @param name - the name of the key value storage
	 * @param key - the key to set the value of
	 * @param value - the value to set in any of the supported data types
	 * @param params - the KeyValueStorageSetParams
	 *
	 * @remarks
	 * TTL behavior:
	 * - If TTL is not specified (undefined), the key inherits the namespace's default TTL
	 * - If TTL is null or 0, the key will not expire
	 * - If TTL is a positive number, the key expires after that many seconds
	 * - TTL values below 60 seconds are clamped to 60 seconds by the server
	 * - TTL values above 7,776,000 seconds (90 days) are clamped to 90 days
	 * - If the namespace doesn't exist, it is auto-created with a 7-day default TTL
	 */
	async set<T = unknown>(
		name: string,
		key: string,
		value: T,
		params?: KeyValueStorageSetParams
	): Promise<void> {
		// TTL handling: only include if explicitly provided
		// null or 0 = no expiration (send 0 to server), positive = TTL in seconds
		// undefined = not sent, server uses namespace default
		let ttlstr = '';
		if (params?.ttl !== undefined) {
			const ttlValue = params.ttl === null ? 0 : params.ttl;
			ttlstr = `/${ttlValue}`;
		}
		const url = buildUrl(
			this.#baseUrl,
			`/kv/${encodeURIComponent(name)}/${encodeURIComponent(key)}${ttlstr}`
		);
		const [body, contentType] = await toPayload(value);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<T>(url, {
			method: 'PUT',
			signal,
			body,
			contentType: params?.contentType || contentType,
			telemetry: {
				name: 'agentuity.keyvalue.set',
				attributes: {
					name,
					key,
					ttl: ttlstr,
				},
			},
		});
		if (res.ok) {
			return;
		}
		throw await toServiceException('PUT', url, res.response);
	}

	async delete(name: string, key: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/kv/${encodeURIComponent(name)}/${encodeURIComponent(key)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.delete',
				attributes: {
					name,
					key,
				},
			},
		});
		if (res.ok) {
			return;
		}
		throw await toServiceException('DELETE', url, res.response);
	}

	async getStats(name: string): Promise<KeyValueStats> {
		const url = buildUrl(this.#baseUrl, `/kv/stats/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(30_000); // 30s timeout for Neon cold starts
		const res = await this.#adapter.invoke<KeyValueStats>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.getStats',
				attributes: { name },
			},
		});
		if (res.ok) {
			return res.data;
		}
		throw await toServiceException('GET', url, res.response);
	}

	async getAllStats(
		params?: GetAllStatsParams
	): Promise<Record<string, KeyValueStats> | KeyValueStatsPaginated> {
		const queryParams = new URLSearchParams();
		if (params?.limit !== undefined) {
			queryParams.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			queryParams.set('offset', String(params.offset));
		}
		if (params?.sort) {
			queryParams.set('sort', params.sort);
		}
		if (params?.direction) {
			queryParams.set('direction', params.direction);
		}
		if (params?.name) {
			queryParams.set('name', params.name);
		}
		if (params?.projectId) {
			queryParams.set('project_id', params.projectId);
		}
		if (params?.agentId) {
			queryParams.set('agent_id', params.agentId);
		}
		if (params?.projectName) {
			queryParams.set('project_name', params.projectName);
		}
		if (params?.agentName) {
			queryParams.set('agent_name', params.agentName);
		}
		const queryString = queryParams.toString();
		const url = buildUrl(
			this.#baseUrl,
			`/kv/stats${queryString ? `?${queryString}` : ''}`
		);
		const signal = AbortSignal.timeout(30_000); // 30s timeout for Neon cold starts
		const res = await this.#adapter.invoke<
			Record<string, KeyValueStats> | KeyValueStatsPaginated
		>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.getAllStats',
				attributes: {},
			},
		});
		if (res.ok) {
			return res.data;
		}
		throw await toServiceException('GET', url, res.response);
	}

	async getNamespaces(): Promise<string[]> {
		const url = buildUrl(this.#baseUrl, '/kv/namespaces');
		const signal = AbortSignal.timeout(30_000); // 30s timeout for Neon cold starts
		const res = await this.#adapter.invoke<string[]>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.getNamespaces',
				attributes: {},
			},
		});
		if (res.ok) {
			return res.data;
		}
		throw await toServiceException('GET', url, res.response);
	}

	async search<T = unknown>(
		name: string,
		keyword: string
	): Promise<Record<string, KeyValueItemWithMetadata<T>>> {
		const url = buildUrl(
			this.#baseUrl,
			`/kv/search/${encodeURIComponent(name)}/${encodeURIComponent(keyword)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<Record<string, KeyValueItemWithMetadata<T>>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.search',
				attributes: { name, keyword },
			},
		});
		if (res.ok) {
			return deserializeSearchResults<T>(res.data);
		}
		throw await toServiceException('GET', url, res.response);
	}

	async getKeys(name: string): Promise<string[]> {
		const url = buildUrl(this.#baseUrl, `/kv/keys/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<string[]>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.getKeys',
				attributes: { name },
			},
		});
		if (res.ok) {
			return res.data;
		}
		throw await toServiceException('GET', url, res.response);
	}

	async deleteNamespace(name: string): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/kv/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.deleteNamespace',
				attributes: { name },
			},
		});
		if (res.ok) {
			return;
		}
		throw await toServiceException('DELETE', url, res.response);
	}

	async createNamespace(name: string, params?: CreateNamespaceParams): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/kv/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(30_000); // 30s timeout for Neon cold starts

		const body =
			params?.defaultTTLSeconds !== undefined
				? JSON.stringify({ default_ttl_seconds: params.defaultTTLSeconds })
				: undefined;

		const res = await this.#adapter.invoke(url, {
			method: 'POST',
			signal,
			...(body && { body, contentType: 'application/json' }),
			telemetry: {
				name: 'agentuity.keyvalue.createNamespace',
				attributes: { name },
			},
		});
		if (res.ok) {
			return;
		}
		throw await toServiceException('POST', url, res.response);
	}
}
