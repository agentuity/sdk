import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api';
import { OrgResourceResponseError } from './util';

const OrgS3Resource = z.object({
	bucket_name: z.string().describe('the S3 bucket name'),
	access_key: z.string().nullable().optional().describe('the S3 access key'),
	secret_key: z.string().nullable().optional().describe('the S3 secret key'),
	region: z.string().nullable().optional().describe('the S3 region'),
	endpoint: z.string().nullable().optional().describe('the S3 endpoint'),
	cloud_region: z.string().describe('the cloud region where this resource is provisioned'),
});

const OrgDBResource = z.object({
	name: z.string().describe('the database name'),
	username: z.string().nullable().optional().describe('the database username'),
	password: z.string().nullable().optional().describe('the database password'),
	url: z.string().nullable().optional().describe('the full database connection URL'),
	logical_databases: z.array(z.string()).optional().describe('list of logical databases'),
	cloud_region: z.string().describe('the cloud region where this resource is provisioned'),
});

const OrgResourceListResponse = z.object({
	s3: z.array(OrgS3Resource),
	db: z.array(OrgDBResource),
});

const OrgResourceListResponseSchema = APIResponseSchema(OrgResourceListResponse);

export type OrgResourceListResponse = z.infer<typeof OrgResourceListResponseSchema>;
export type OrgResourceList = z.infer<typeof OrgResourceListResponse>;
export type OrgS3Resource = z.infer<typeof OrgS3Resource>;
export type OrgDBResource = z.infer<typeof OrgDBResource>;

export interface ListOrgResourcesOptions {
	/** Filter by resource type (default: "all") */
	type?: 'all' | 's3' | 'db';
	/** Include logical databases in DB resources (default: true) */
	includeLogicalDbs?: boolean;
}

/**
 * List all resources for the authenticated organization (across all regions)
 * Extracts orgId from authentication context (API key, SDK, or CLI token)
 *
 * @param client - Catalyst API client (must be authenticated)
 * @param options - Optional filters
 * @returns List of S3 and DB resources with their cloud regions
 *
 * @example
 * // Get all resources
 * const all = await listOrgResources(client);
 *
 * @example
 * // Get only S3 buckets
 * const s3Only = await listOrgResources(client, { type: 's3' });
 *
 * @example
 * // Get only DBs without logical databases (faster)
 * const dbsOnly = await listOrgResources(client, {
 *   type: 'db',
 *   includeLogicalDbs: false
 * });
 */
export async function listOrgResources(
	client: APIClient,
	options?: ListOrgResourcesOptions
): Promise<OrgResourceList> {
	const params = new URLSearchParams();
	if (options?.type && options.type !== 'all') {
		params.set('type', options.type);
	}
	if (options?.includeLogicalDbs === false) {
		params.set('include_logical_dbs', 'false');
	}

	const query = params.toString();
	const url = `/resource/2025-11-16${query ? `?${query}` : ''}`;

	const resp = await client.request<OrgResourceListResponse>(
		'GET',
		url,
		OrgResourceListResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new OrgResourceResponseError({ message: resp.message });
}
