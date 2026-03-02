import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api.ts';
import { BucketConfigSchema, BucketConfigUpdateSchema, type BucketConfig, type BucketConfigUpdate } from './types.ts';
import { API_VERSION, BucketConfigResponseError } from './util.ts';

export const BucketConfigGetResponseSchema = APIResponseSchema(BucketConfigSchema);
export const BucketConfigUpdateResponseSchema = APIResponseSchema(BucketConfigSchema);
export const BucketConfigDeleteResponseSchema = APIResponseSchemaNoData();

/**
 * Get the configuration for a bucket.
 * Returns the current config with null for any fields using system defaults.
 *
 * @param client - The API client to use for the request
 * @param bucketName - Name of the bucket to get config for
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @returns The bucket configuration
 * @throws {BucketConfigResponseError} If the request fails
 */
export async function getBucketConfig(
	client: APIClient,
	bucketName: string,
	extraHeaders?: Record<string, string>,
): Promise<BucketConfig> {
	const url = `/bucket/config/${API_VERSION}/${encodeURIComponent(bucketName)}`;

	const resp = await client.get<z.infer<typeof BucketConfigGetResponseSchema>>(
		url,
		BucketConfigGetResponseSchema,
		undefined,
		extraHeaders,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new BucketConfigResponseError({ message: resp.message });
}

/**
 * Update (upsert) bucket configuration.
 * Partial update: only fields present in the request are changed.
 * Send null for a field to reset it to system default.
 * Omit a field to leave it unchanged.
 *
 * @param client - The API client to use for the request
 * @param bucketName - Name of the bucket to update config for
 * @param config - Partial config update (fields to set, null to unset, omit to leave)
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @returns The updated bucket configuration
 * @throws {BucketConfigResponseError} If the request fails
 */
export async function updateBucketConfig(
	client: APIClient,
	bucketName: string,
	config: BucketConfigUpdate,
	extraHeaders?: Record<string, string>,
): Promise<BucketConfig> {
	const url = `/bucket/config/${API_VERSION}/${encodeURIComponent(bucketName)}`;

	const resp = await client.put<z.infer<typeof BucketConfigUpdateResponseSchema>, BucketConfigUpdate>(
		url,
		config,
		BucketConfigUpdateResponseSchema,
		BucketConfigUpdateSchema,
		undefined,
		extraHeaders,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new BucketConfigResponseError({ message: resp.message });
}

/**
 * Delete all custom configuration for a bucket (reset to system defaults).
 *
 * @param client - The API client to use for the request
 * @param bucketName - Name of the bucket to reset config for
 * @param extraHeaders - Optional extra headers (e.g. x-agentuity-orgid for CLI auth)
 * @throws {BucketConfigResponseError} If the request fails
 */
export async function deleteBucketConfig(
	client: APIClient,
	bucketName: string,
	extraHeaders?: Record<string, string>,
): Promise<void> {
	const url = `/bucket/config/${API_VERSION}/${encodeURIComponent(bucketName)}`;

	const resp = await client.delete<z.infer<typeof BucketConfigDeleteResponseSchema>>(
		url,
		BucketConfigDeleteResponseSchema,
		undefined,
		extraHeaders,
	);

	if (!resp.success) {
		throw new BucketConfigResponseError({ message: resp.message });
	}
}
