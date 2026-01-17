import { z } from 'zod';
import { APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api';
import { SandboxResponseError, API_VERSION } from './util';

const SnapshotFileInfoSchema = z
	.object({
		path: z.string().describe('File path within the snapshot'),
		size: z.number().describe('File size in bytes'),
	})
	.describe('Information about a file in a snapshot');

const SnapshotInfoSchema = z
	.object({
		snapshotId: z.string().describe('Unique identifier for the snapshot'),
		runtimeId: z
			.string()
			.nullable()
			.optional()
			.describe('Runtime ID associated with this snapshot'),
		name: z
			.string()
			.describe(
				'Display name for the snapshot (URL-safe: letters, numbers, underscores, dashes)'
			),
		description: z.string().nullable().optional().describe('Description of the snapshot'),
		tag: z.string().nullable().optional().describe('Tag for the snapshot (defaults to "latest")'),
		sizeBytes: z.number().describe('Total size of the snapshot in bytes'),
		fileCount: z.number().describe('Number of files in the snapshot'),
		parentSnapshotId: z
			.string()
			.nullable()
			.optional()
			.describe('ID of the parent snapshot (for incremental snapshots)'),
		public: z.boolean().optional().describe('Whether the snapshot is publicly accessible'),
		createdAt: z.string().describe('ISO timestamp when the snapshot was created'),
		downloadUrl: z.string().optional().describe('URL to download the snapshot archive'),
		files: z
			.array(SnapshotFileInfoSchema)
			.nullable()
			.optional()
			.describe('List of files in the snapshot'),
		userMetadata: z
			.record(z.string(), z.string())
			.nullable()
			.optional()
			.describe('User-defined metadata key-value pairs'),
	})
	.describe('Detailed information about a snapshot');

const SnapshotCreateResponseSchema = APIResponseSchema(SnapshotInfoSchema);
const SnapshotGetResponseSchema = APIResponseSchema(SnapshotInfoSchema);
const SnapshotListDataSchema = z
	.object({
		snapshots: z.array(SnapshotInfoSchema).describe('List of snapshot entries'),
		total: z.number().describe('Total number of snapshots matching the query'),
	})
	.describe('Paginated list of snapshots');
const SnapshotListResponseSchema = APIResponseSchema(SnapshotListDataSchema);
const SnapshotDeleteResponseSchema = APIResponseSchemaNoData();

export type SnapshotFileInfo = z.infer<typeof SnapshotFileInfoSchema>;
export type SnapshotInfo = z.infer<typeof SnapshotInfoSchema>;
export type SnapshotListResponse = z.infer<typeof SnapshotListDataSchema>;

const _SnapshotCreateParamsSchema = z
	.object({
		sandboxId: z.string().describe('ID of the sandbox to snapshot'),
		name: z.string().optional().describe('Display name for the snapshot'),
		description: z.string().optional().describe('Description of the snapshot'),
		tag: z.string().optional().describe('Tag for the snapshot'),
		public: z
			.boolean()
			.optional()
			.describe('Whether to make the snapshot publicly accessible (default: false)'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for creating a snapshot');

const _SnapshotGetParamsSchema = z
	.object({
		snapshotId: z.string().describe('ID of the snapshot to retrieve'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for getting a snapshot');

const _SnapshotListParamsSchema = z
	.object({
		sandboxId: z.string().optional().describe('Filter by sandbox ID'),
		limit: z.number().optional().describe('Maximum number of snapshots to return'),
		offset: z.number().optional().describe('Number of snapshots to skip'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for listing snapshots');

const _SnapshotDeleteParamsSchema = z
	.object({
		snapshotId: z.string().describe('ID of the snapshot to delete'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for deleting a snapshot');

const _SnapshotTagParamsSchema = z
	.object({
		snapshotId: z.string().describe('ID of the snapshot to tag'),
		tag: z.string().nullable().describe('New tag (or null to remove)'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for tagging a snapshot');

export type SnapshotCreateParams = z.infer<typeof _SnapshotCreateParamsSchema>;
export type SnapshotGetParams = z.infer<typeof _SnapshotGetParamsSchema>;
export type SnapshotListParams = z.infer<typeof _SnapshotListParamsSchema>;
export type SnapshotDeleteParams = z.infer<typeof _SnapshotDeleteParamsSchema>;
export type SnapshotTagParams = z.infer<typeof _SnapshotTagParamsSchema>;

function buildQueryString(params: Record<string, string | number | undefined>): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			query.set(key, String(value));
		}
	}
	const str = query.toString();
	return str ? `?${str}` : '';
}

/**
 * Creates a snapshot of a sandbox's current state.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID and optional tag
 * @returns The created snapshot information
 * @throws {SandboxResponseError} If the snapshot creation fails
 */
export async function snapshotCreate(
	client: APIClient,
	params: SnapshotCreateParams
): Promise<SnapshotInfo> {
	const { sandboxId, name, description, tag, public: isPublic, orgId } = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/${sandboxId}/snapshot${queryString}`;

	const body: Record<string, string | boolean> = {};
	if (name) {
		body.name = name;
	}
	if (description) {
		body.description = description;
	}
	if (tag) {
		body.tag = tag;
	}
	if (isPublic !== undefined) {
		body.public = isPublic;
	}

	const resp = await client.post<z.infer<typeof SnapshotCreateResponseSchema>>(
		url,
		body,
		SnapshotCreateResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}

/**
 * Retrieves detailed information about a specific snapshot.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the snapshot ID
 * @returns Snapshot information including files and download URL
 * @throws {SandboxResponseError} If the snapshot is not found or request fails
 */
export async function snapshotGet(
	client: APIClient,
	params: SnapshotGetParams
): Promise<SnapshotInfo> {
	const { snapshotId, orgId } = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/${snapshotId}${queryString}`;

	const resp = await client.get<z.infer<typeof SnapshotGetResponseSchema>>(
		url,
		SnapshotGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}

/**
 * Lists snapshots with optional filtering and pagination.
 *
 * @param client - The API client to use for the request
 * @param params - Optional parameters for filtering by sandbox and pagination
 * @returns Paginated list of snapshots with total count
 * @throws {SandboxResponseError} If the request fails
 */
export async function snapshotList(
	client: APIClient,
	params: SnapshotListParams = {}
): Promise<SnapshotListResponse> {
	const { sandboxId, limit, offset, orgId } = params;
	const queryString = buildQueryString({ sandboxId, limit, offset, orgId });
	const url = `/sandbox/${API_VERSION}/snapshots${queryString}`;

	const resp = await client.get<z.infer<typeof SnapshotListResponseSchema>>(
		url,
		SnapshotListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}

/**
 * Deletes a snapshot and releases its storage.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the snapshot ID to delete
 * @throws {SandboxResponseError} If the snapshot is not found or deletion fails
 */
export async function snapshotDelete(
	client: APIClient,
	params: SnapshotDeleteParams
): Promise<void> {
	const { snapshotId, orgId } = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/${snapshotId}${queryString}`;

	const resp = await client.delete<z.infer<typeof SnapshotDeleteResponseSchema>>(
		url,
		SnapshotDeleteResponseSchema
	);

	if (!resp.success) {
		throw new SandboxResponseError({ message: resp.message });
	}
}

/**
 * Updates or removes the tag on a snapshot.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including snapshot ID and new tag (or null to remove)
 * @returns Updated snapshot information
 * @throws {SandboxResponseError} If the snapshot is not found or update fails
 */
export async function snapshotTag(
	client: APIClient,
	params: SnapshotTagParams
): Promise<SnapshotInfo> {
	const { snapshotId, tag, orgId } = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/${snapshotId}${queryString}`;

	const resp = await client.patch<z.infer<typeof SnapshotGetResponseSchema>>(
		url,
		{ tag },
		SnapshotGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}

// ===== Snapshot Build API =====

const _SnapshotBuildInitParamsSchema = z
	.object({
		runtime: z.string().describe('Runtime identifier (name:tag or runtime ID)'),
		name: z.string().optional().describe('Display name for the snapshot'),
		tag: z.string().optional().describe('Tag for the snapshot'),
		description: z.string().optional().describe('Description of the snapshot'),
		contentHash: z
			.string()
			.optional()
			.describe('SHA-256 hash of snapshot content for change detection'),
		force: z.boolean().optional().describe('Force rebuild even if content is unchanged'),
		encrypt: z.boolean().optional().describe('Request encryption for the snapshot archive'),
		public: z
			.boolean()
			.optional()
			.describe('Whether to make the snapshot publicly accessible (default: false)'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for initializing a snapshot build');

const SnapshotBuildInitResponseSchema = z
	.object({
		snapshotId: z.string().optional().describe('Unique identifier for the snapshot being built'),
		uploadUrl: z
			.string()
			.optional()
			.describe('Pre-signed URL for uploading the snapshot archive'),
		s3Key: z.string().optional().describe('S3 key where the snapshot will be stored'),
		publicKey: z
			.string()
			.optional()
			.describe('PEM-encoded public key for encrypting the snapshot archive'),
		unchanged: z.boolean().optional().describe('True if snapshot content is unchanged'),
		existingId: z.string().optional().describe('ID of existing unchanged snapshot'),
		existingName: z.string().optional().describe('Name of existing unchanged snapshot'),
		existingTag: z.string().optional().describe('Tag of existing unchanged snapshot'),
	})
	.describe('Response from snapshot build init API');

const SnapshotBuildInitAPIResponseSchema = APIResponseSchema(SnapshotBuildInitResponseSchema);

const _SnapshotBuildFinalizeParamsSchema = z
	.object({
		snapshotId: z.string().describe('Snapshot ID from init response'),
		sizeBytes: z.number().describe('Total size of the snapshot in bytes'),
		fileCount: z.number().describe('Number of files in the snapshot'),
		files: z.array(SnapshotFileInfoSchema).describe('List of files with path and size'),
		dependencies: z.array(z.string()).optional().describe('List of apt packages to install'),
		env: z.record(z.string(), z.string()).optional().describe('Environment variables to set'),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe('User-defined metadata key-value pairs'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for finalizing a snapshot build');

export type SnapshotBuildInitParams = z.infer<typeof _SnapshotBuildInitParamsSchema>;
export type SnapshotBuildInitResponse = z.infer<typeof SnapshotBuildInitResponseSchema>;
export type SnapshotBuildFinalizeParams = z.infer<typeof _SnapshotBuildFinalizeParamsSchema>;

/**
 * Initialize a snapshot build by getting a presigned upload URL.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including runtime and optional name/tag/description
 * @returns Snapshot ID and presigned upload URL
 * @throws {SandboxResponseError} If the initialization fails
 */
export async function snapshotBuildInit(
	client: APIClient,
	params: SnapshotBuildInitParams
): Promise<SnapshotBuildInitResponse> {
	const { runtime, name, description, tag, contentHash, force, encrypt, public: isPublic, orgId } =
		params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/build${queryString}`;

	const body: Record<string, string | boolean> = { runtime };
	if (name) body.name = name;
	if (description) body.description = description;
	if (tag) body.tag = tag;
	if (contentHash) body.contentHash = contentHash;
	if (force) body.force = force;
	if (encrypt) body.encrypt = encrypt;
	if (isPublic !== undefined) body.public = isPublic;

	const resp = await client.post<z.infer<typeof SnapshotBuildInitAPIResponseSchema>>(
		url,
		body,
		SnapshotBuildInitAPIResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}

/**
 * Finalize a snapshot build after uploading the archive.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including snapshot details and file metadata
 * @returns The created snapshot information
 * @throws {SandboxResponseError} If the finalization fails
 */
export async function snapshotBuildFinalize(
	client: APIClient,
	params: SnapshotBuildFinalizeParams
): Promise<SnapshotInfo> {
	const { snapshotId, sizeBytes, fileCount, files, dependencies, env, metadata, orgId } = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/${snapshotId}/finalize${queryString}`;

	const body: Record<string, unknown> = {
		sizeBytes,
		fileCount,
		files,
	};
	if (dependencies) body.dependencies = dependencies;
	if (env) body.env = env;
	if (metadata) body.metadata = metadata;

	const resp = await client.post<z.infer<typeof SnapshotGetResponseSchema>>(
		url,
		body,
		SnapshotGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}
