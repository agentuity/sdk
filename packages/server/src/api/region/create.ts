import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api.ts';
import { RegionResponseError } from './util.ts';

/**
 * Database name validation regex - must match catalyst server validation:
 * - Must start with a letter or underscore
 * - Can contain only lowercase letters, digits, and underscores
 * - Must be lowercase
 */
const DATABASE_NAME_REGEX = /^[a-z_][a-z0-9_]*$/;
const MAX_DATABASE_NAME_LENGTH = 63;
const MIN_DATABASE_NAME_LENGTH = 1;

/**
 * S3 bucket name validation - must match catalyst server validation (AWS S3 rules):
 * - Length [3, 63]
 * - Only lowercase, numbers, dots, hyphens
 * - No adjacent periods
 * - Starts with lowercase or number
 * - Ends with lowercase or number
 * - No xn-- prefix
 * - No -s3alias suffix
 * - Not an IP address
 */
const BUCKET_NAME_REGEX = /^[a-z0-9.-]+$/;
const MAX_BUCKET_NAME_LENGTH = 63;
const MIN_BUCKET_NAME_LENGTH = 3;
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Validates a database name for PostgreSQL compatibility.
 * Matches the server-side validation in catalyst.
 */
export function validateDatabaseName(name: string): { valid: boolean; error?: string } {
	if (name.length < MIN_DATABASE_NAME_LENGTH) {
		return { valid: false, error: 'database name is too short (minimum 1 character)' };
	}
	if (name.length > MAX_DATABASE_NAME_LENGTH) {
		return {
			valid: false,
			error: `database name is too long (maximum ${MAX_DATABASE_NAME_LENGTH} characters)`,
		};
	}
	if (name !== name.toLowerCase()) {
		return { valid: false, error: 'database name must be lowercase' };
	}
	if (!DATABASE_NAME_REGEX.test(name)) {
		return {
			valid: false,
			error: 'database name must start with a letter or underscore and contain only lowercase letters, digits, and underscores',
		};
	}
	if (name.startsWith('pg_')) {
		return {
			valid: false,
			error: "database name cannot start with 'pg_' (reserved by PostgreSQL)",
		};
	}
	return { valid: true };
}

/**
 * Validates an S3 bucket name according to AWS S3 naming rules.
 * Matches the server-side validation in catalyst.
 */
export function validateBucketName(name: string): { valid: boolean; error?: string } {
	if (name.length < MIN_BUCKET_NAME_LENGTH) {
		return {
			valid: false,
			error: `bucket name is too short (minimum ${MIN_BUCKET_NAME_LENGTH} characters)`,
		};
	}
	if (name.length > MAX_BUCKET_NAME_LENGTH) {
		return {
			valid: false,
			error: `bucket name is too long (maximum ${MAX_BUCKET_NAME_LENGTH} characters)`,
		};
	}
	if (!BUCKET_NAME_REGEX.test(name)) {
		return {
			valid: false,
			error: 'bucket name can only contain lowercase letters, numbers, dots, and hyphens',
		};
	}
	if (name.includes('..')) {
		return { valid: false, error: 'bucket name cannot contain adjacent periods' };
	}
	const firstChar = name[0];
	if (
		firstChar === undefined ||
		!((firstChar >= 'a' && firstChar <= 'z') || (firstChar >= '0' && firstChar <= '9'))
	) {
		return { valid: false, error: 'bucket name must start with a lowercase letter or number' };
	}
	const lastChar = name[name.length - 1];
	if (
		lastChar === undefined ||
		!((lastChar >= 'a' && lastChar <= 'z') || (lastChar >= '0' && lastChar <= '9'))
	) {
		return { valid: false, error: 'bucket name must end with a lowercase letter or number' };
	}
	if (name.startsWith('xn--')) {
		return { valid: false, error: 'bucket name cannot start with xn--' };
	}
	if (name.endsWith('-s3alias')) {
		return { valid: false, error: 'bucket name cannot end with -s3alias' };
	}
	if (isIPv4Address(name)) {
		return { valid: false, error: 'bucket name cannot be an IP address' };
	}
	// Reserved prefixes (system-generated names)
	if (name.startsWith('ag-') || name.startsWith('ago-') || name.startsWith('agentuity')) {
		return {
			valid: false,
			error: 'bucket names starting with "ag-", "ago-", or "agentuity" are reserved for system use',
		};
	}
	return { valid: true };
}

function isIPv4Address(s: string): boolean {
	if (!IPV4_REGEX.test(s)) {
		return false;
	}
	const parts = s.split('.');
	for (const part of parts) {
		const num = parseInt(part, 10);
		if (Number.isNaN(num) || num < 0 || num > 255) {
			return false;
		}
	}
	return true;
}

export const ResourceSpec = z.object({
	type: z.enum(['db', 's3']).describe('the resource type'),
	name: z.string().optional().describe('optional custom name for db'),
	description: z.string().optional().describe('optional description for db'),
});

export const CreateResourcesRequest = z.object({
	resources: z.array(ResourceSpec).describe('list of resources to create'),
});

export const CreatedResource = z.object({
	type: z.string().describe('the resource type'),
	name: z.string().describe('the resource name'),
	env: z.record(z.string(), z.string()).describe('environment variables for the resource'),
});

export const CreateResourcesResponse = z.object({
	created: z.array(CreatedResource),
});

export const CreateResourcesResponseSchema = APIResponseSchema(CreateResourcesResponse);

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
	resources: Array<{ type: 'db' | 's3'; name?: string; description?: string }>
): Promise<CreatedResource[]> {
	// Validate resource names before sending to server
	for (const resource of resources) {
		if (resource.type === 'db' && resource.name) {
			const validation = validateDatabaseName(resource.name);
			if (!validation.valid) {
				throw new RegionResponseError({ message: validation.error! });
			}
		}
		if (resource.type === 's3' && resource.name) {
			const validation = validateBucketName(resource.name);
			if (!validation.valid) {
				throw new RegionResponseError({ message: validation.error! });
			}
		}
	}

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
