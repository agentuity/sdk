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
		throw await toServiceException(url, res.response);
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
		throw await toServiceException(url, res.response);
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
		throw await toServiceException(url, res.response);
	}
}
