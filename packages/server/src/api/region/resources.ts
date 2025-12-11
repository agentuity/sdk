import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api';
import { RegionResponseError } from './util';

const ResourceListResponse = z.object({
	s3: z.array(
		z.object({
			bucket_name: z.string().describe('the S3 bucket name'),
			access_key: z.string().nullable().optional().describe('the S3 access key'),
			secret_key: z.string().nullable().optional().describe('the S3 secret key'),
			region: z.string().nullable().optional().describe('the S3 region'),
			endpoint: z.string().nullable().optional().describe('the S3 endpoint'),
			cname: z.string().nullable().optional().describe('the S3 CNAME'),
		})
	),
	db: z.array(
		z.object({
			name: z.string().describe('the database name'),
			username: z.string().nullable().optional().describe('the database username'),
			password: z.string().nullable().optional().describe('the database password'),
			url: z.string().nullable().optional().describe('the full database connection URL'),
		})
	),
	redis: z
		.object({
			url: z.string().describe('the Redis connection URL'),
		})
		.optional(),
});
const ResourceListResponseSchema = APIResponseSchema(ResourceListResponse);

export type ResourceListResponse = z.infer<typeof ResourceListResponseSchema>;
export type ResourceList = z.infer<typeof ResourceListResponse>;

/**
 * List all resources for a given organization and region
 *
 * @param client
 * @param orgId
 * @param region
 * @returns
 */
export async function listResources(
	client: APIClient,
	orgId: string,
	region: string
): Promise<ResourceList> {
	const resp = await client.request<ResourceListResponse>(
		'GET',
		`/resource/2025-03-17/${orgId}/${region}`,
		ResourceListResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new RegionResponseError({ message: resp.message });
}
