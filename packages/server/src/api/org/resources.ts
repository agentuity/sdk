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
	org_id: z.string().describe('the organization ID that owns this resource'),
	org_name: z.string().describe('the organization name that owns this resource'),
});

const OrgDBResource = z.object({
	name: z.string().describe('the database name'),
	description: z.string().nullable().optional().describe('optional description of the database'),
	username: z.string().nullable().optional().describe('the database username'),
	password: z.string().nullable().optional().describe('the database password'),
	url: z.string().nullable().optional().describe('the full database connection URL'),
	cloud_region: z.string().describe('the cloud region where this resource is provisioned'),
	org_id: z.string().describe('the organization ID that owns this resource'),
	org_name: z.string().describe('the organization name that owns this resource'),
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
	/** Organization ID (required for CLI auth, extracted from context for SDK auth) */
	orgId?: string;
}

/**
 * List all resources for the authenticated organization (across all regions)
 *
 * @param client - Catalyst API client (must be authenticated)
 * @param options - Optional filters including orgId for CLI auth
 * @returns List of S3 and DB resources with their cloud regions
 *
 * @example
 * // Get all resources (SDK auth - orgId from context)
 * const all = await listOrgResources(client);
 *
 * @example
 * // Get all resources (CLI auth - orgId required)
 * const all = await listOrgResources(client, { orgId: 'org_123' });
 *
 * @example
 * // Get only S3 buckets
 * const s3Only = await listOrgResources(client, { type: 's3', orgId: 'org_123' });
 *
 * @example
 * // Get only DBs
 * const dbsOnly = await listOrgResources(client, { type: 'db', orgId: 'org_123' });
 */
export async function listOrgResources(
	client: APIClient,
	options?: ListOrgResourcesOptions
): Promise<OrgResourceList> {
	const params = new URLSearchParams();
	if (options?.type && options.type !== 'all') {
		params.set('type', options.type);
	}

	const query = params.toString();
	const url = `/resource/2025-11-16${query ? `?${query}` : ''}`;

	// Build headers - include orgId for CLI auth
	const headers: Record<string, string> = {};
	if (options?.orgId) {
		headers['x-agentuity-orgid'] = options.orgId;
	}

	const resp = await client.request<OrgResourceListResponse>(
		'GET',
		url,
		OrgResourceListResponseSchema,
		undefined,
		undefined,
		undefined,
		headers
	);
	if (resp.success) {
		return resp.data;
	}
	throw new OrgResourceResponseError({ message: resp.message });
}
