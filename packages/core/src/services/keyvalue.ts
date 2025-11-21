import { FetchAdapter } from './adapter';
import { buildUrl, toServiceException, toPayload } from './_util';

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
	 * the number of milliseconds to keep the value in the cache
	 */
	ttl?: number;
	/**
	 * the content type of the value
	 */
	contentType?: string;
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
	size: number;
	created_at: string;
	updated_at: string;
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
	 * @returns map of namespace names to statistics
	 */
	getAllStats(): Promise<Record<string, KeyValueStats>>;

	/**
	 * get all namespace names
	 *
	 * @returns array of namespace names
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
	 */
	createNamespace(name: string): Promise<void>;
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
			`/kv/2025-03-17/${encodeURIComponent(name)}/${encodeURIComponent(key)}`
		);
		const signal = AbortSignal.timeout(10_000);
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
			return {
				data: res.data,
				contentType: res.response.headers.get('content-type') ?? 'application/octet-stream',
				exists: true,
			};
		}
		if (res.response.status === 404) {
			return { exists: false } as DataResultNotFound;
		}
		throw await toServiceException(url, 'GET', res.response);
	}

	async set<T = unknown>(
		name: string,
		key: string,
		value: T,
		params?: KeyValueStorageSetParams
	): Promise<void> {
		let ttlstr = '';
		if (params?.ttl) {
			if (params.ttl < 60) {
				throw new Error(`ttl for keyvalue set must be at least 60 seconds, got ${params.ttl}`);
			}
			ttlstr = `/${params.ttl}`;
		}
		const url = buildUrl(
			this.#baseUrl,
			`/kv/2025-03-17/${encodeURIComponent(name)}/${encodeURIComponent(key)}${ttlstr}`
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
		throw await toServiceException(url, 'PUT', res.response);
	}

	async delete(name: string, key: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/kv/2025-03-17/${encodeURIComponent(name)}/${encodeURIComponent(key)}`
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
		throw await toServiceException(url, 'DELETE', res.response);
	}

	async getStats(name: string): Promise<KeyValueStats> {
		const url = buildUrl(this.#baseUrl, `/kv/2025-03-17/stats/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(10_000);
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
		throw await toServiceException(url, 'GET', res.response);
	}

	async getAllStats(): Promise<Record<string, KeyValueStats>> {
		const url = buildUrl(this.#baseUrl, '/kv/2025-03-17/stats');
		const signal = AbortSignal.timeout(10_000);
		const res = await this.#adapter.invoke<Record<string, KeyValueStats>>(url, {
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
		throw await toServiceException(url, 'GET', res.response);
	}

	async getNamespaces(): Promise<string[]> {
		const stats = await this.getAllStats();
		return Object.keys(stats);
	}

	async search<T = unknown>(
		name: string,
		keyword: string
	): Promise<Record<string, KeyValueItemWithMetadata<T>>> {
		const url = buildUrl(
			this.#baseUrl,
			`/kv/2025-03-17/search/${encodeURIComponent(name)}/${encodeURIComponent(keyword)}`
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
			return res.data;
		}
		throw await toServiceException(url, 'GET', res.response);
	}

	async getKeys(name: string): Promise<string[]> {
		const url = buildUrl(this.#baseUrl, `/kv/2025-03-17/keys/${encodeURIComponent(name)}`);
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
		throw await toServiceException(url, 'GET', res.response);
	}

	async deleteNamespace(name: string): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/kv/2025-03-17/${encodeURIComponent(name)}`);
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
		throw await toServiceException(url, 'DELETE', res.response);
	}

	async createNamespace(name: string): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/kv/2025-03-17/${encodeURIComponent(name)}`);
		const signal = AbortSignal.timeout(10_000);
		const res = await this.#adapter.invoke(url, {
			method: 'POST',
			signal,
			telemetry: {
				name: 'agentuity.keyvalue.createNamespace',
				attributes: { name },
			},
		});
		if (res.ok) {
			return;
		}
		throw await toServiceException(url, 'POST', res.response);
	}
}
