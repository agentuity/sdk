import { z } from 'zod';
import { APIResponseSchema, type APIClient } from '../api.ts';
import { RegionResponseError } from './util.ts';

export const ResourceListResponse = z.object({
	s3: z.array(
		z.object({
			bucket_name: z.string().describe('the S3 bucket name'),
			access_key: z.string().nullable().optional().describe('the S3 access key'),
			secret_key: z.string().nullable().optional().describe('the S3 secret key'),
			region: z.string().nullable().optional().describe('the S3 region'),
			endpoint: z.string().nullable().optional().describe('the S3 endpoint'),
			cname: z.string().nullable().optional().describe('the S3 CNAME'),
			env: z.record(z.string(), z.string()).describe('environment variables for the resource'),
			bucket_type: z.string().describe('the bucket type (user or snapshots)'),
			internal: z.boolean().describe('whether this is a system-managed bucket'),
			description: z
				.string()
				.nullable()
				.optional()
				.describe('optional description of the bucket'),
		})
	),
	db: z.array(
		z.object({
			name: z.string().describe('the database name'),
			username: z.string().nullable().optional().describe('the database username'),
			password: z.string().nullable().optional().describe('the database password'),
			url: z.string().nullable().optional().describe('the full database connection URL'),
			env: z.record(z.string(), z.string()).describe('environment variables for the resource'),
			internal: z
				.boolean()
				.describe('whether this is a system-managed database (KV/Vector/Queue)'),
		})
	),
	redis: z
		.object({
			url: z.string().describe('the Redis connection URL'),
		})
		.optional(),
});
export const ResourceListResponseSchema = APIResponseSchema(ResourceListResponse);

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
		`/resource/${orgId}/${region}`,
		ResourceListResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new RegionResponseError({ message: resp.message });
}
