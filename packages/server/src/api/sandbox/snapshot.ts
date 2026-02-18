import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api';
import { API_VERSION, SandboxResponseError, throwSandboxError } from './util';

export const SnapshotFileInfoSchema = z
	.object({
		path: z.string().describe('File path within the snapshot'),
		size: z.number().describe('File size in bytes'),
		sha256: z.string().describe('SHA256 hash of the file contents'),
		contentType: z.string().describe('MIME type of the file'),
		mode: z.number().describe('Unix file mode/permissions (e.g., 0o644)'),
	})
	.describe('Information about a file in a snapshot');

export const SnapshotOrgInfoSchema = z
	.object({
		id: z.string().describe('Organization ID'),
		name: z.string().describe('Organization name'),
		slug: z.string().nullable().optional().describe('Organization slug for building full name'),
	})
	.describe('Organization information for public snapshots');

export const SnapshotUserInfoSchema = z
	.object({
		id: z.string().describe('User ID'),
		firstName: z.string().nullable().optional().describe('User first name'),
		lastName: z.string().nullable().optional().describe('User last name'),
	})
	.describe('User information for private snapshots');

export const SnapshotInfoSchema = z
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
		fullName: z
			.string()
			.optional()
			.describe('Full name with org slug for public snapshots (@slug/name:tag)'),
		description: z.string().nullable().optional().describe('Description of the snapshot'),
		message: z.string().nullable().optional().describe('Build message for the snapshot'),
		tag: z.string().nullable().optional().describe('Tag for the snapshot (defaults to "latest")'),
		sizeBytes: z.number().describe('Total size of the snapshot in bytes'),
		fileCount: z.number().describe('Number of files in the snapshot'),
		parentSnapshotId: z
			.string()
			.nullable()
			.optional()
			.describe('ID of the parent snapshot (for incremental snapshots)'),
		public: z.boolean().optional().describe('Whether the snapshot is publicly accessible'),
		orgName: z.string().optional().describe('Organization name (for public snapshots)'),
		orgSlug: z.string().optional().describe('Organization slug (for public snapshots)'),
		org: SnapshotOrgInfoSchema.nullable()
			.optional()
			.describe('Organization details (for public snapshots)'),
		user: SnapshotUserInfoSchema.nullable()
			.optional()
			.describe('User who pushed the snapshot (for private snapshots)'),
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

export const SnapshotCreateResponseSchema = APIResponseSchema(SnapshotInfoSchema);
export const SnapshotGetResponseSchema = APIResponseSchema(SnapshotInfoSchema);
export const SnapshotListDataSchema = z
	.object({
		snapshots: z.array(SnapshotInfoSchema).describe('List of snapshot entries'),
		total: z.number().describe('Total number of snapshots matching the query'),
	})
	.describe('Paginated list of snapshots');
export const SnapshotListResponseSchema = APIResponseSchema(SnapshotListDataSchema);
export const SnapshotDeleteResponseSchema = APIResponseSchemaNoData();

export const SnapshotLineageEntrySchema = z
	.object({
		snapshotId: z.string().describe('Unique identifier for the snapshot'),
		name: z
			.string()
			.describe(
				'Display name for the snapshot (URL-safe: letters, numbers, underscores, dashes)'
			),
		fullName: z
			.string()
			.optional()
			.describe('Full name with org slug for public snapshots (@slug/name:tag)'),
		message: z.string().nullable().optional().describe('Build message for the snapshot'),
		tag: z.string().nullable().optional().describe('Tag for the snapshot'),
		parentSnapshotId: z
			.string()
			.nullable()
			.optional()
			.describe('ID of the parent snapshot in the lineage'),
		public: z.boolean().describe('Whether the snapshot is publicly accessible'),
		deleted: z.boolean().optional().describe('Whether the snapshot has been deleted'),
		org: SnapshotOrgInfoSchema.nullable()
			.optional()
			.describe('Organization details (for public snapshots)'),
		user: SnapshotUserInfoSchema.nullable()
			.optional()
			.describe('User who pushed the snapshot (for private snapshots)'),
		createdAt: z.string().describe('ISO timestamp when the snapshot was created'),
	})
	.describe('A single entry in the snapshot lineage chain');

export const SnapshotLineageDataSchema = z
	.object({
		lineage: z.array(SnapshotLineageEntrySchema).describe('Ordered list of snapshots in lineage'),
		total: z.number().describe('Total number of snapshots in the lineage'),
	})
	.describe('Snapshot lineage response');

export const SnapshotLineageResponseSchema = APIResponseSchema(SnapshotLineageDataSchema);

export type SnapshotFileInfo = z.infer<typeof SnapshotFileInfoSchema>;
export type SnapshotInfo = z.infer<typeof SnapshotInfoSchema>;
export type SnapshotListResponse = z.infer<typeof SnapshotListDataSchema>;
export type SnapshotLineageEntry = z.infer<typeof SnapshotLineageEntrySchema>;
export type SnapshotLineageResponse = z.infer<typeof SnapshotLineageDataSchema>;

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
		sort: z.string().optional().describe('Field to sort by'),
		direction: z.enum(['asc', 'desc']).optional().describe('Sort direction (asc or desc)'),
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

const _SnapshotLineageParamsSchema = z
	.object({
		snapshot: z
			.string()
			.optional()
			.describe(
				'Snapshot ID or name:tag to start lineage from (e.g., "sss_xxx" or "myimage:v1")'
			),
		name: z
			.string()
			.optional()
			.describe('Snapshot name to start lineage from (uses latest if tag not specified)'),
		tag: z.string().optional().describe('Tag to use with name parameter'),
		limit: z
			.number()
			.optional()
			.describe('Maximum number of snapshots to return in lineage (default: 100, max: 1000)'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for getting snapshot lineage');

export type SnapshotCreateParams = z.infer<typeof _SnapshotCreateParamsSchema>;
export type SnapshotGetParams = z.infer<typeof _SnapshotGetParamsSchema>;
export type SnapshotListParams = z.infer<typeof _SnapshotListParamsSchema>;
export type SnapshotDeleteParams = z.infer<typeof _SnapshotDeleteParamsSchema>;
export type SnapshotTagParams = z.infer<typeof _SnapshotTagParamsSchema>;
export type SnapshotLineageParams = z.infer<typeof _SnapshotLineageParamsSchema>;

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

	throwSandboxError(resp, {});
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

	throwSandboxError(resp, {});
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
	const { sandboxId, limit, offset, sort, direction, orgId } = params;
	const queryString = buildQueryString({ sandboxId, limit, offset, sort, direction, orgId });
	const url = `/sandbox/${API_VERSION}/snapshots${queryString}`;

	const resp = await client.get<z.infer<typeof SnapshotListResponseSchema>>(
		url,
		SnapshotListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, {});
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
		throwSandboxError(resp, {});
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

	throwSandboxError(resp, {});
}

/**
 * Gets the lineage (ancestry chain) of a snapshot.
 *
 * Returns an ordered list of snapshots from the specified snapshot (or latest by name)
 * walking back through parentSnapshotId references to the root.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters specifying which snapshot to get lineage for
 * @returns Ordered list of snapshots in the lineage (newest to oldest)
 * @throws {SandboxResponseError} If the snapshot is not found or request fails
 *
 * @example
 * // Get lineage starting from a specific snapshot ID
 * const lineage = await snapshotLineage(client, { snapshot: 'snp_abc123' });
 *
 * @example
 * // Get lineage starting from the latest snapshot with a given name
 * const lineage = await snapshotLineage(client, { name: 'myapp' });
 *
 * @example
 * // Get lineage starting from a specific name:tag
 * const lineage = await snapshotLineage(client, { name: 'myapp', tag: 'v1.0.0' });
 */
export async function snapshotLineage(
	client: APIClient,
	params: SnapshotLineageParams
): Promise<SnapshotLineageResponse> {
	const { snapshot, name, tag, limit, orgId } = params;
	const queryString = buildQueryString({ snapshot, name, tag, limit, orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/lineage${queryString}`;

	const resp = await client.get<z.infer<typeof SnapshotLineageResponseSchema>>(
		url,
		SnapshotLineageResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, {});
}

// ===== Public Snapshot API =====

const _SnapshotPublicListParamsSchema = z
	.object({
		limit: z
			.number()
			.optional()
			.describe('Maximum number of snapshots to return (default: 50, max: 100)'),
		offset: z.number().optional().describe('Number of snapshots to skip for pagination'),
	})
	.describe('Parameters for listing public snapshots');

export type SnapshotPublicListParams = z.infer<typeof _SnapshotPublicListParamsSchema>;

const _SnapshotPublicGetParamsSchema = z
	.object({
		snapshotRef: z
			.string()
			.describe('Snapshot reference: ID (snp_xxx), full name (@slug/name:tag), or name:tag'),
	})
	.describe('Parameters for getting a public snapshot');

export type SnapshotPublicGetParams = z.infer<typeof _SnapshotPublicGetParamsSchema>;

/**
 * Gets a public snapshot without requiring authentication.
 *
 * Supports multiple reference formats:
 * - Snapshot ID: `snp_abc123`
 * - Full name with org slug: `@myorg/myimage:latest`
 * - Simple name:tag: `myimage:v1.0`
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the snapshot reference
 * @returns Snapshot information including files and download URL
 * @throws {SandboxResponseError} If the snapshot is not found or is not public
 *
 * @example
 * // Get by snapshot ID
 * const snapshot = await snapshotPublicGet(client, { snapshotRef: 'snp_abc123' });
 *
 * @example
 * // Get by full name with org slug
 * const snapshot = await snapshotPublicGet(client, { snapshotRef: '@agentuity/bun:latest' });
 *
 * @example
 * // Get by name:tag
 * const snapshot = await snapshotPublicGet(client, { snapshotRef: 'bun:1.2' });
 */
export async function snapshotPublicGet(
	client: APIClient,
	params: SnapshotPublicGetParams
): Promise<SnapshotInfo> {
	const { snapshotRef } = params;
	const url = `/sandbox/${API_VERSION}/snapshots/public/${encodeURIComponent(snapshotRef)}`;

	const resp = await client.get<z.infer<typeof SnapshotGetResponseSchema>>(
		url,
		SnapshotGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, {});
}

/**
 * Lists all public snapshots across the platform.
 *
 * Returns paginated list of snapshots that have been marked as public,
 * regardless of which organization owns them.
 *
 * @param client - The API client to use for the request
 * @param params - Optional parameters for pagination
 * @returns Paginated list of public snapshots with total count
 * @throws {SandboxResponseError} If the request fails
 *
 * @example
 * // List first page of public snapshots
 * const result = await snapshotPublicList(client);
 * console.log(result.snapshots);
 *
 * @example
 * // List with pagination
 * const result = await snapshotPublicList(client, { limit: 20, offset: 40 });
 */
export async function snapshotPublicList(
	client: APIClient,
	params: SnapshotPublicListParams = {}
): Promise<SnapshotListResponse> {
	const { limit, offset } = params;
	const queryString = buildQueryString({ limit, offset });
	const url = `/sandbox/${API_VERSION}/snapshots/public${queryString}`;

	const resp = await client.get<z.infer<typeof SnapshotListResponseSchema>>(
		url,
		SnapshotListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, {});
}

// ===== Snapshot Build API =====

/**
 * Git information for snapshot builds
 */
export const SnapshotBuildGitInfoSchema = z
	.object({
		branch: z.string().optional().describe('Git branch name'),
		commit: z.string().optional().describe('Git commit SHA'),
		repo: z.string().optional().describe('Git repository URL'),
		provider: z.string().optional().describe('Git provider (github, gitlab, bitbucket)'),
		commitUrl: z.string().optional().describe('URL to the commit'),
	})
	.describe('Git information for the snapshot build');

const _SnapshotBuildInitParamsSchema = z
	.object({
		runtime: z.string().describe('Runtime identifier (name:tag or runtime ID)'),
		name: z.string().optional().describe('Display name for the snapshot'),
		tag: z.string().optional().describe('Tag for the snapshot'),
		description: z.string().optional().describe('Description of the snapshot'),
		message: z.string().optional().describe('Build message for the snapshot'),
		git: SnapshotBuildGitInfoSchema.optional().describe('Git information for the build'),
		contentHash: z
			.string()
			.optional()
			.describe('SHA-256 hash of snapshot content for change detection'),
		force: z.boolean().optional().describe('Force rebuild even if content is unchanged'),
		encrypt: z.boolean().optional().describe('Request encryption for the snapshot archive'),
		public: z
			.boolean()
			.optional()
			.describe('Make snapshot public (enables virus scanning, disables encryption)'),
		orgId: z.string().optional().describe('Organization ID'),
	})
	.describe('Parameters for initializing a snapshot build');

export type SnapshotBuildGitInfo = z.infer<typeof SnapshotBuildGitInfoSchema>;

export const SnapshotBuildInitResponseSchema = z
	.object({
		snapshotId: z.string().optional().describe('Unique identifier for the snapshot being built'),
		uploadUrl: z
			.string()
			.optional()
			.describe('Pre-signed URL for uploading the snapshot archive (private snapshots only)'),
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

export const SnapshotBuildInitAPIResponseSchema = APIResponseSchema(
	SnapshotBuildInitResponseSchema
);

const _SnapshotBuildFinalizeParamsSchema = z
	.object({
		snapshotId: z.string().describe('Snapshot ID from init response'),
		sizeBytes: z.number().describe('Total size of the snapshot in bytes'),
		fileCount: z.number().describe('Number of files in the snapshot'),
		files: z.array(SnapshotFileInfoSchema).describe('List of files with path and size'),
		dependencies: z.array(z.string()).optional().describe('List of apt packages to install'),
		packages: z.array(z.string()).optional().describe('List of npm/bun packages to install globally'),
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
	const {
		runtime,
		name,
		description,
		message,
		git,
		tag,
		contentHash,
		force,
		encrypt,
		public: isPublic,
		orgId,
	} = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/build${queryString}`;

	const body: Record<string, string | boolean | SnapshotBuildGitInfo> = { runtime };
	if (name) body.name = name;
	if (description) body.description = description;
	if (message) body.message = message;
	if (git) body.git = git;
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

	throwSandboxError(resp, {});
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
	const { snapshotId, sizeBytes, fileCount, files, dependencies, packages, env, metadata, orgId } =
		params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/${snapshotId}/finalize${queryString}`;

	const body: Record<string, unknown> = {
		sizeBytes,
		fileCount,
		files,
	};
	if (dependencies) body.dependencies = dependencies;
	if (packages) body.packages = packages;
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

	throwSandboxError(resp, {});
}

// ===== Snapshot Upload API (for public snapshots) =====

export const SnapshotUploadResponseSchema = z
	.object({
		success: z.boolean().describe('Whether the upload was successful'),
		scanned: z.boolean().describe('Whether the upload was virus scanned'),
		message: z.string().optional().describe('Optional message'),
	})
	.describe('Response from snapshot upload API');

const _SnapshotUploadAPIResponseSchema = APIResponseSchema(SnapshotUploadResponseSchema);

export type SnapshotUploadResponse = z.infer<typeof SnapshotUploadResponseSchema>;

export interface SnapshotUploadParams {
	snapshotId: string;
	body: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array> | string | Blob;
	contentLength: number;
	orgId?: string;
}

/**
 * Upload a public snapshot archive via Catalyst (with virus scanning).
 * This should only be used when snapshotBuildInit returns no uploadUrl.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including snapshotId and the archive body
 * @returns Upload result with scan status
 * @throws {SandboxResponseError} If the upload fails or malware is detected
 */
export async function snapshotUpload(
	client: APIClient,
	params: SnapshotUploadParams
): Promise<SnapshotUploadResponse> {
	const { snapshotId, body, contentLength, orgId } = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${API_VERSION}/snapshots/${snapshotId}/upload${queryString}`;

	const response = await client.rawPut(url, body, 'application/gzip', undefined, {
		'Content-Length': String(contentLength),
		Accept: 'application/json',
	});

	if (!response.ok) {
		const text = await response.text();
		let message = `Upload failed: ${response.status} ${response.statusText}`;
		try {
			const json = JSON.parse(text);
			if (json.message) {
				message = json.message;
			} else if (json.error) {
				message = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
			}
		} catch {
			if (text) {
				message = text;
			}
		}
		throw new SandboxResponseError({ message });
	}

	const data = (await response.json()) as z.infer<typeof _SnapshotUploadAPIResponseSchema>;
	if (data.success) {
		return data.data;
	}

	throwSandboxError(data, {});
}
