import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api';
import { RegionResponseError } from './util';

const ResourceSpec = z.object({
	type: z.enum(['db', 's3']).describe('the resource type'),
	name: z.string().optional().describe('optional custom name for db'),
});

const CreateResourcesRequest = z.object({
	resources: z.array(ResourceSpec).describe('list of resources to create'),
});

const CreatedResource = z.object({
	type: z.string().describe('the resource type'),
	name: z.string().describe('the resource name'),
});

const CreateResourcesResponse = z.object({
	created: z.array(CreatedResource),
});

const CreateResourcesResponseSchema = APIResponseSchema(CreateResourcesResponse);

export type CreateResourcesRequest = z.infer<typeof CreateResourcesRequest>;
export type CreateResourcesResponse = z.infer<typeof CreateResourcesResponseSchema>;
export type CreatedResource = z.infer<typeof CreatedResource>;

/**
 * Create one or more resources (DB or S3) for an organization in a specific region
 * Requires CLI authentication
 *
 * @param client - Catalyst API client
 * @param orgId - Organization ID
 * @param region - Cloud region
 * @param resources - Array of resources to create
 * @returns
 */
export async function createResources(
	client: APIClient,
	orgId: string,
	region: string,
	resources: Array<{ type: 'db' | 's3'; name?: string }>
): Promise<CreatedResource[]> {
	const resp = await client.request<CreateResourcesResponse, CreateResourcesRequest>(
		'POST',
		`/resource/2025-11-16/${orgId}/${region}`,
		CreateResourcesResponseSchema,
		{ resources },
		CreateResourcesRequest
	);
	if (resp.success) {
		return resp.data.created;
	}
	throw new RegionResponseError({
		message: resp.message,
	});
}
