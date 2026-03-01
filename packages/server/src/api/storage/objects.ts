import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import {
	StorageListResponseSchema,
	StorageDeleteResponseSchema,
	StoragePresignResponseSchema,
	StorageStatsResponseSchema,
	StorageAnalyticsResponseSchema,
	type StorageListResponse,
	type StorageDeleteResponse,
	type StoragePresignResponse,
	type StorageStatsResponse,
	type StorageAnalyticsResponse,
} from './types.ts';
import { STORAGE_OBJECTS_API_VERSION, StorageObjectsResponseError } from './util.ts';

export const StorageListAPIResponseSchema = APIResponseSchema(StorageListResponseSchema);
export const StorageDeleteAPIResponseSchema = APIResponseSchema(StorageDeleteResponseSchema);
export const StoragePresignAPIResponseSchema = APIResponseSchema(StoragePresignResponseSchema);
export const StorageStatsAPIResponseSchema = APIResponseSchema(StorageStatsResponseSchema);
export const StorageAnalyticsAPIResponseSchema = APIResponseSchema(StorageAnalyticsResponseSchema);

export interface ListStorageObjectsOptions {
	prefix?: string;
	limit?: number;
	offset?: number;
}

/**
 * List objects in a storage bucket with optional prefix filtering and pagination.
 *
 * @param client - The API client to use for the request
 * @param bucketName - Name of the bucket to list objects from
 * @param options - Optional filtering/pagination options
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @returns Paginated list of objects with total count
 * @throws {StorageObjectsResponseError} If the request fails
 */
export async function listStorageObjects(
	client: APIClient,
	bucketName: string,
	options?: ListStorageObjectsOptions,
	extraHeaders?: Record<string, string>,
): Promise<StorageListResponse> {
	const params = new URLSearchParams();
	if (options?.prefix) params.set('prefix', options.prefix);
	if (options?.limit !== undefined) params.set('limit', String(options.limit));
	if (options?.offset !== undefined) params.set('offset', String(options.offset));

	const query = params.toString();
	const url = `/storage/objects/${STORAGE_OBJECTS_API_VERSION}/${bucketName}${query ? `?${query}` : ''}`;

	const resp = await client.get<z.infer<typeof StorageListAPIResponseSchema>>(
		url,
		StorageListAPIResponseSchema,
		undefined,
		extraHeaders,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new StorageObjectsResponseError({ message: resp.message });
}

export interface DeleteStorageObjectsOptions {
	key?: string;
	prefix?: string;
}

/**
 * Delete objects from a storage bucket.
 * Provide either `key` (single object) or `prefix` (all matching objects).
 *
 * @param client - The API client to use for the request
 * @param bucketName - Name of the bucket to delete from
 * @param options - Must include either key or prefix
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @returns The count of deleted objects
 * @throws {StorageObjectsResponseError} If the request fails
 */
export async function deleteStorageObjects(
	client: APIClient,
	bucketName: string,
	options: DeleteStorageObjectsOptions,
	extraHeaders?: Record<string, string>,
): Promise<StorageDeleteResponse> {
	if (!options.key && !options.prefix) {
		throw new StorageObjectsResponseError({ message: "Either 'key' or 'prefix' is required" });
	}

	const params = new URLSearchParams();
	if (options.key) params.set('key', options.key);
	if (options.prefix) params.set('prefix', options.prefix);

	const url = `/storage/objects/${STORAGE_OBJECTS_API_VERSION}/${bucketName}?${params.toString()}`;

	const resp = await client.delete<z.infer<typeof StorageDeleteAPIResponseSchema>>(
		url,
		StorageDeleteAPIResponseSchema,
		undefined,
		extraHeaders,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new StorageObjectsResponseError({ message: resp.message });
}

/**
 * Generate a presigned URL for downloading or uploading an object.
 *
 * @param client - The API client to use for the request
 * @param bucketName - Name of the bucket
 * @param key - Object key
 * @param operation - 'download' (default) or 'upload'
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @returns Presigned URL and expiry info
 * @throws {StorageObjectsResponseError} If the request fails
 */
export async function presignStorageObject(
	client: APIClient,
	bucketName: string,
	key: string,
	operation: 'download' | 'upload' = 'download',
	extraHeaders?: Record<string, string>,
): Promise<StoragePresignResponse> {
	const params = new URLSearchParams();
	params.set('key', key);
	if (operation !== 'download') {
		params.set('operation', operation);
	}

	const url = `/storage/presign/${STORAGE_OBJECTS_API_VERSION}/${bucketName}?${params.toString()}`;

	const resp = await client.get<z.infer<typeof StoragePresignAPIResponseSchema>>(
		url,
		StoragePresignAPIResponseSchema,
		undefined,
		extraHeaders,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new StorageObjectsResponseError({ message: resp.message });
}

/**
 * Get aggregate stats for a storage bucket (object count, total size).
 *
 * @param client - The API client to use for the request
 * @param bucketName - Name of the bucket
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @returns Bucket statistics
 * @throws {StorageObjectsResponseError} If the request fails
 */
export async function getStorageStats(
	client: APIClient,
	bucketName: string,
	extraHeaders?: Record<string, string>,
): Promise<StorageStatsResponse> {
	const url = `/storage/stats/${STORAGE_OBJECTS_API_VERSION}/${bucketName}`;

	const resp = await client.get<z.infer<typeof StorageStatsAPIResponseSchema>>(
		url,
		StorageStatsAPIResponseSchema,
		undefined,
		extraHeaders,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new StorageObjectsResponseError({ message: resp.message });
}

export interface GetStorageAnalyticsOptions {
	days?: number;
}

/**
 * Get storage analytics for the org: summary totals, per-bucket breakdown, and daily snapshots.
 *
 * @param client - The API client to use for the request
 * @param options - Optional options (days for sparkline history, default 180)
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @returns Analytics data with summary, buckets, and daily snapshots
 * @throws {StorageObjectsResponseError} If the request fails
 */
export async function getStorageAnalytics(
	client: APIClient,
	options?: GetStorageAnalyticsOptions,
	extraHeaders?: Record<string, string>,
): Promise<StorageAnalyticsResponse> {
	const params = new URLSearchParams();
	if (options?.days !== undefined) params.set('days', String(options.days));

	const query = params.toString();
	const url = `/storage/analytics/${STORAGE_OBJECTS_API_VERSION}${query ? `?${query}` : ''}`;

	const resp = await client.get<z.infer<typeof StorageAnalyticsAPIResponseSchema>>(
		url,
		StorageAnalyticsAPIResponseSchema,
		undefined,
		extraHeaders,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new StorageObjectsResponseError({ message: resp.message });
}
