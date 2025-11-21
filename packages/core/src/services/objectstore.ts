import type { FetchAdapter, FetchRequest, Body } from './adapter';
import { buildUrl, toServiceException } from './_util';

/**
 * Parameters for putting an object into the object store
 */
export interface ObjectStorePutParams {
	/**
	 * the content type of the object
	 */
	contentType?: string;

	/**
	 * the content encoding of the object
	 */
	contentEncoding?: string;

	/**
	 * the cache control header for the object
	 */
	cacheControl?: string;

	/**
	 * the content disposition header for the object
	 */
	contentDisposition?: string;

	/**
	 * the content language header for the object
	 */
	contentLanguage?: string;

	/**
	 * arbitrary metadata to attach to the object but not returned as part of the object when fetched via HTTP
	 */
	metadata?: Record<string, string>;
}

/**
 * Result when an object is found in the object store
 */
export interface ObjectResultFound {
	/**
	 * the object data
	 */
	data: Uint8Array;

	/**
	 * the content type of the object
	 */
	contentType: string;

	/**
	 * the object was found
	 */
	exists: true;
}

/**
 * Result when an object is not found in the object store
 */
export interface ObjectResultNotFound {
	data: never;

	/**
	 * the object was not found
	 */
	exists: false;
}

/**
 * The result of an object store get operation
 */
export type ObjectResult = ObjectResultFound | ObjectResultNotFound;

/**
 * Parameters for creating a public URL
 */
export interface CreatePublicURLParams {
	/**
	 * the duration of the signed URL in milliseconds. If not provided, the default is 1 hour.
	 */
	expiresDuration?: number;
}

interface ObjectStoreCreatePublicURLSuccessResponse {
	success: true;
	url: string;
}

interface ObjectStoreCreatePublicURLErrorResponse {
	success: false;
	message: string;
}

type ObjectStoreCreatePublicURLResponse =
	| ObjectStoreCreatePublicURLSuccessResponse
	| ObjectStoreCreatePublicURLErrorResponse;

/**
 * Information about an object in the object store
 */
export interface ObjectInfo {
	key: string;
	size: number;
	etag: string;
	created_at: string;
	updated_at: string;
}

/**
 * Information about a bucket in the object store
 */
export interface BucketInfo {
	name: string;
	object_count: number;
	total_bytes: number;
}

/**
 * Object store service for storing and retrieving binary data
 */
export interface ObjectStorage {
	/**
	 * Get an object from the object store
	 *
	 * @param bucket - the bucket to get the object from
	 * @param key - the key of the object to get
	 * @returns a Promise that resolves to the object result
	 *
	 * @example
	 * ```typescript
	 * const result = await objectStore.get('my-bucket', 'my-key');
	 * if (result.exists) {
	 *   console.log('Content type:', result.contentType);
	 *   console.log('Data:', result.data);
	 * }
	 * ```
	 */
	get(bucket: string, key: string): Promise<ObjectResult>;

	/**
	 * Put an object into the object store
	 *
	 * @param bucket - the bucket to put the object into
	 * @param key - the key of the object to put
	 * @param data - the data to put (Uint8Array, ArrayBuffer, or ReadableStream)
	 * @param params - optional parameters for the put operation
	 *
	 * @example
	 * ```typescript
	 * const data = new TextEncoder().encode('Hello, world!');
	 * await objectStore.put('my-bucket', 'greeting.txt', data, {
	 *   contentType: 'text/plain',
	 *   metadata: { author: 'user123' }
	 * });
	 * ```
	 */
	put(
		bucket: string,
		key: string,
		data: Uint8Array | ArrayBuffer | ReadableStream,
		params?: ObjectStorePutParams
	): Promise<void>;

	/**
	 * Delete an object from the object store
	 *
	 * @param bucket - the bucket to delete the object from
	 * @param key - the key of the object to delete
	 * @returns true if the object was deleted, false if the object did not exist
	 *
	 * @example
	 * ```typescript
	 * const deleted = await objectStore.delete('my-bucket', 'my-key');
	 * if (deleted) {
	 *   console.log('Object was deleted');
	 * } else {
	 *   console.log('Object did not exist');
	 * }
	 * ```
	 */
	delete(bucket: string, key: string): Promise<boolean>;

	/**
	 * Create a public URL for an object. This URL can be used to access the object without authentication.
	 *
	 * @param bucket - the bucket to create the signed URL for
	 * @param key - the key of the object to create the signed URL for
	 * @param params - optional parameters including expiration duration
	 * @returns the public URL
	 *
	 * @example
	 * ```typescript
	 * const url = await objectStore.createPublicURL('my-bucket', 'my-key', {
	 *   expiresDuration: 3600000 // 1 hour in milliseconds
	 * });
	 * console.log('Public URL:', url);
	 * ```
	 */
	createPublicURL(bucket: string, key: string, params?: CreatePublicURLParams): Promise<string>;

	/**
	 * List all buckets in the object store
	 *
	 * @returns array of bucket information
	 *
	 * @example
	 * ```typescript
	 * const buckets = await objectStore.listBuckets();
	 * for (const bucket of buckets) {
	 *   console.log(`${bucket.name}: ${bucket.object_count} objects, ${bucket.total_bytes} bytes`);
	 * }
	 * ```
	 */
	listBuckets(): Promise<BucketInfo[]>;

	/**
	 * List all keys in a bucket
	 *
	 * @param bucket - the bucket to list keys from
	 * @returns array of object information
	 *
	 * @example
	 * ```typescript
	 * const objects = await objectStore.listKeys('my-bucket');
	 * for (const obj of objects) {
	 *   console.log(`${obj.key}: ${obj.size} bytes`);
	 * }
	 * ```
	 */
	listKeys(bucket: string): Promise<ObjectInfo[]>;

	/**
	 * List objects in a bucket with optional filtering
	 *
	 * @param bucket - the bucket to list objects from
	 * @param options - optional filtering (prefix, limit)
	 * @returns array of object information
	 *
	 * @example
	 * ```typescript
	 * const objects = await objectStore.listObjects('my-bucket', { prefix: 'docs/', limit: 100 });
	 * for (const obj of objects) {
	 *   console.log(`${obj.key}: ${obj.size} bytes`);
	 * }
	 * ```
	 */
	listObjects(bucket: string, options?: { prefix?: string; limit?: number }): Promise<ObjectInfo[]>;

	/**
	 * Get object metadata without retrieving the data
	 *
	 * @param bucket - the bucket containing the object
	 * @param key - the key of the object
	 * @returns object metadata (size, contentType, etc.)
	 *
	 * @example
	 * ```typescript
	 * const metadata = await objectStore.headObject('my-bucket', 'my-key');
	 * console.log(`Size: ${metadata.size}, Type: ${metadata.contentType}`);
	 * ```
	 */
	headObject(bucket: string, key: string): Promise<ObjectInfo>;

	/**
	 * Delete a bucket and all its contents
	 *
	 * @param bucket - the bucket to delete
	 * @returns true if the bucket was deleted
	 *
	 * @example
	 * ```typescript
	 * await objectStore.deleteBucket('my-bucket');
	 * ```
	 */
	deleteBucket(bucket: string): Promise<boolean>;
}

/**
 * Implementation of the ObjectStorage interface
 */
export class ObjectStorageService implements ObjectStorage {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#baseUrl = baseUrl;
		this.#adapter = adapter;
	}

	async get(bucket: string, key: string): Promise<ObjectResult> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}
		if (!key?.trim()) {
			throw new Error('key is required and cannot be empty');
		}

		const url = buildUrl(
			this.#baseUrl,
			`/object/2025-03-17/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`
		);

		const signal = AbortSignal.timeout(10_000);
		const options: FetchRequest = {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.objectstore.get',
				attributes: {
					'objectstore.bucket': bucket,
					'objectstore.key': key,
				},
			},
		};

		try {
			const result = await this.#adapter.invoke<ArrayBuffer>(url, options);

			if (result.response.status === 404) {
				return { exists: false } as ObjectResultNotFound;
			}

			if (!result.ok) {
				throw new Error(
					`Failed to get object: ${result.response.statusText} (${result.response.status})`
				);
			}

			const data = result.data;
			if (!(data instanceof ArrayBuffer)) {
				throw new Error('Expected ArrayBuffer response from object store');
			}

			const contentType =
				result.response.headers.get('content-type') || 'application/octet-stream';

			return {
				exists: true,
				data: new Uint8Array(data),
				contentType,
			} as ObjectResultFound;
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'GET', err);
			}
			throw err;
		}
	}

	async put(
		bucket: string,
		key: string,
		data: Uint8Array | ArrayBuffer | ReadableStream,
		params?: ObjectStorePutParams
	): Promise<void> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}
		if (!key?.trim()) {
			throw new Error('key is required and cannot be empty');
		}
		if (!data) {
			throw new Error('data is required');
		}

		const url = buildUrl(
			this.#baseUrl,
			`/object/2025-03-17/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`
		);

		const headers: Record<string, string> = {
			'Content-Type': params?.contentType || 'application/octet-stream',
		};

		if (params?.contentEncoding) {
			headers['Content-Encoding'] = params.contentEncoding;
		}

		if (params?.cacheControl) {
			headers['Cache-Control'] = params.cacheControl;
		}

		if (params?.contentDisposition) {
			headers['Content-Disposition'] = params.contentDisposition;
		}

		if (params?.contentLanguage) {
			headers['Content-Language'] = params.contentLanguage;
		}

		if (params?.metadata) {
			for (const [metaKey, metaValue] of Object.entries(params.metadata)) {
				headers[`x-metadata-${metaKey}`] = metaValue;
			}
		}

		let body: Body;
		if (data instanceof ArrayBuffer) {
			body = data;
		} else if (data instanceof Uint8Array) {
			if (data.byteOffset !== 0 || data.byteLength !== data.buffer.byteLength) {
				body = data.buffer.slice(
					data.byteOffset,
					data.byteOffset + data.byteLength
				) as ArrayBuffer;
			} else {
				body = data.buffer as ArrayBuffer;
			}
		} else {
			body = data;
		}

		const signal = AbortSignal.timeout(30_000);
		const options: FetchRequest = {
			method: 'PUT',
			headers,
			body,
			signal,
			telemetry: {
				name: 'agentuity.objectstore.put',
				attributes: {
					'objectstore.bucket': bucket,
					'objectstore.key': key,
					'objectstore.contentType': params?.contentType || 'application/octet-stream',
				},
			},
		};

		try {
			const result = await this.#adapter.invoke(url, options);

			if (!result.ok || (result.response.status !== 200 && result.response.status !== 201)) {
				throw new Error(
					`Failed to put object: ${result.response.statusText} (${result.response.status})`
				);
			}
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'PUT', err);
			}
			throw err;
		}
	}

	async delete(bucket: string, key: string): Promise<boolean> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}
		if (!key?.trim()) {
			throw new Error('key is required and cannot be empty');
		}

		const url = buildUrl(
			this.#baseUrl,
			`/object/2025-03-17/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`
		);

		const signal = AbortSignal.timeout(10_000);
		const options: FetchRequest = {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.objectstore.delete',
				attributes: {
					'objectstore.bucket': bucket,
					'objectstore.key': key,
				},
			},
		};

		try {
			const result = await this.#adapter.invoke(url, options);

			if (result.response.status === 404) {
				return false;
			}

			if (result.response.status === 200) {
				return true;
			}

			throw new Error(
				`Failed to delete object: ${result.response.statusText} (${result.response.status})`
			);
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'DELETE', err);
			}
			throw err;
		}
	}

	async createPublicURL(
		bucket: string,
		key: string,
		params?: CreatePublicURLParams
	): Promise<string> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}
		if (!key?.trim()) {
			throw new Error('key is required and cannot be empty');
		}

		const url = buildUrl(
			this.#baseUrl,
			`/object/2025-03-17/presigned/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`
		);

		const requestBody: { expires?: number } = {};
		if (params?.expiresDuration) {
			requestBody.expires = params.expiresDuration;
		}

		const signal = AbortSignal.timeout(10_000);
		const options: FetchRequest = {
			method: 'POST',
			contentType: 'application/json',
			body: JSON.stringify(requestBody),
			signal,
			telemetry: {
				name: 'agentuity.objectstore.createPublicURL',
				attributes: {
					'objectstore.bucket': bucket,
					'objectstore.key': key,
					'objectstore.expiresDuration': params?.expiresDuration?.toString() || '',
				},
			},
		};

		try {
			const result = await this.#adapter.invoke<ObjectStoreCreatePublicURLResponse>(
				url,
				options
			);

			if (!result.ok) {
				throw new Error(
					`Failed to create public URL: ${result.response.statusText} (${result.response.status})`
				);
			}

			const data = result.data;

			if (!data.success) {
				throw new Error(data.message || 'Failed to create public URL');
			}

			return data.url;
		} catch (err) {
			if (err instanceof Error && err.message.includes('Object not found')) {
				throw err;
			}
			if (err instanceof Response) {
				throw await toServiceException(url, 'POST', err);
			}
			throw err;
		}
	}

	async listBuckets(): Promise<BucketInfo[]> {
		const url = buildUrl(this.#baseUrl, '/object/2025-03-17/buckets');

		const signal = AbortSignal.timeout(10_000);
		const options: FetchRequest = {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.objectstore.listBuckets',
				attributes: {},
			},
		};

		try {
			const result = await this.#adapter.invoke<{ buckets: BucketInfo[] }>(url, options);

			if (!result.ok) {
				throw new Error(
					`Failed to list buckets: ${result.response.statusText} (${result.response.status})`
				);
			}

			return result.data.buckets;
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'GET', err);
			}
			throw err;
		}
	}

	async listKeys(bucket: string): Promise<ObjectInfo[]> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}

		const url = buildUrl(this.#baseUrl, `/object/2025-03-17/keys/${encodeURIComponent(bucket)}`);

		const signal = AbortSignal.timeout(10_000);
		const options: FetchRequest = {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.objectstore.listKeys',
				attributes: {
					'objectstore.bucket': bucket,
				},
			},
		};

		try {
			const result = await this.#adapter.invoke<{ bucket: string; objects: ObjectInfo[] }>(
				url,
				options
			);

			if (!result.ok) {
				throw new Error(
					`Failed to list keys: ${result.response.statusText} (${result.response.status})`
				);
			}

			return result.data.objects;
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'GET', err);
			}
			throw err;
		}
	}

	async listObjects(
		bucket: string,
		options?: { prefix?: string; limit?: number }
	): Promise<ObjectInfo[]> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}

		const params = new URLSearchParams();
		if (options?.prefix) {
			params.set('prefix', options.prefix);
		}
		if (options?.limit) {
			params.set('limit', options.limit.toString());
		}

		const queryString = params.toString();
		const url = buildUrl(
			this.#baseUrl,
			`/object/2025-03-17/objects/${encodeURIComponent(bucket)}${queryString ? `?${queryString}` : ''}`
		);

		const signal = AbortSignal.timeout(10_000);
		const fetchOptions: FetchRequest = {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.objectstore.listObjects',
				attributes: {
					'objectstore.bucket': bucket,
					'objectstore.prefix': options?.prefix || '',
					'objectstore.limit': (options?.limit || 1000).toString(),
				},
			},
		};

		try {
			const result = await this.#adapter.invoke<{ bucket: string; objects: ObjectInfo[] }>(
				url,
				fetchOptions
			);

			if (!result.ok) {
				throw new Error(
					`Failed to list objects: ${result.response.statusText} (${result.response.status})`
				);
			}

			return result.data.objects;
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'GET', err);
			}
			throw err;
		}
	}

	async headObject(bucket: string, key: string): Promise<ObjectInfo> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}
		if (!key?.trim()) {
			throw new Error('key is required and cannot be empty');
		}

		const url = buildUrl(
			this.#baseUrl,
			`/object/2025-03-17/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`
		);

		const signal = AbortSignal.timeout(10_000);
		const fetchOptions: FetchRequest = {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.objectstore.headObject',
				attributes: {
					'objectstore.bucket': bucket,
					'objectstore.key': key,
				},
			},
		};

		try {
			const result = await this.#adapter.invoke<ObjectInfo>(url, fetchOptions);

			if (!result.ok) {
				if (result.response.status === 404) {
					throw new Error('Object not found');
				}
				throw new Error(
					`Failed to get object metadata: ${result.response.statusText} (${result.response.status})`
				);
			}

			return result.data;
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'GET', err);
			}
			throw err;
		}
	}

	async deleteBucket(bucket: string): Promise<boolean> {
		if (!bucket?.trim()) {
			throw new Error('bucket is required and cannot be empty');
		}

		const url = buildUrl(this.#baseUrl, `/object/2025-03-17/${encodeURIComponent(bucket)}`);

		const signal = AbortSignal.timeout(30_000);
		const options: FetchRequest = {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.objectstore.deleteBucket',
				attributes: {
					'objectstore.bucket': bucket,
				},
			},
		};

		try {
			const result = await this.#adapter.invoke(url, options);

			if (result.response.status === 404) {
				return false;
			}

			if (result.response.status === 200) {
				return true;
			}

			throw new Error(
				`Failed to delete bucket: ${result.response.statusText} (${result.response.status})`
			);
		} catch (err) {
			if (err instanceof Response) {
				throw await toServiceException(url, 'DELETE', err);
			}
			throw err;
		}
	}
}
