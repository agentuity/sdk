import { z } from 'zod';
import { APIResponseSchema, type APIClient } from '../api.ts';
import { RegionResponseError } from './util.ts';

export const DeleteResourceSpec = z.object({
	type: z.enum(['db', 's3']).describe('the resource type'),
	name: z.string().describe('the resource name (bucket_name for S3, db_name for DB)'),
});

export const DeleteResourcesRequest = z.object({
	resources: z.array(DeleteResourceSpec).describe('list of resources to delete'),
});

export const DeletedResource = z.object({
	type: z.string().describe('the resource type'),
	name: z.string().describe('the resource name'),
	env_keys: z.array(z.string()).describe('environment variable keys to remove'),
});

export const DeleteResourcesResponse = z.object({
	deleted: z.array(DeletedResource).describe('list of deleted resources'),
});

export const DeleteResourcesResponseSchema = APIResponseSchema(DeleteResourcesResponse);

export type DeleteResourcesRequest = z.infer<typeof DeleteResourcesRequest>;
export type DeleteResourcesResponse = z.infer<typeof DeleteResourcesResponseSchema>;
export type DeletedResource = z.infer<typeof DeletedResource>;

/**
 * Delete one or more resources (DB or S3) for an organization in a specific region
 * Requires CLI authentication
 *
 * @param client - Catalyst API client
 * @param orgId - Organization ID
 * @param region - Cloud region
 * @param resources - Array of resources to delete
 * @returns
 */
export async function deleteResources(
	client: APIClient,
	orgId: string,
	region: string,
	resources: Array<{ type: 'db' | 's3'; name: string }>
): Promise<DeletedResource[]> {
	const resp = await client.request<DeleteResourcesResponse, DeleteResourcesRequest>(
		'DELETE',
		`/resource/${orgId}/${region}`,
		DeleteResourcesResponseSchema,
		{ resources },
		DeleteResourcesRequest
	);
	if (resp.success) {
		return resp.data.deleted;
	}
	throw new RegionResponseError({ message: resp.message });
}
