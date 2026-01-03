import { z } from 'zod';
import { APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api';
import { SandboxResponseError } from './util';

const SNAPSHOT_API_VERSION = '2025-06-26';

const SnapshotFileInfoSchema = z
	.object({
		path: z.string().describe('File path within the snapshot'),
		size: z.number().describe('File size in bytes'),
	})
	.describe('Information about a file in a snapshot');

const SnapshotInfoSchema = z
	.object({
		snapshotId: z.string().describe('Unique identifier for the snapshot'),
		tag: z.string().nullable().optional().describe('User-defined tag for the snapshot'),
		sizeBytes: z.number().describe('Total size of the snapshot in bytes'),
		fileCount: z.number().describe('Number of files in the snapshot'),
		parentSnapshotId: z
			.string()
			.nullable()
			.optional()
			.describe('ID of the parent snapshot (for incremental snapshots)'),
		createdAt: z.string().describe('ISO timestamp when the snapshot was created'),
		downloadUrl: z.string().optional().describe('URL to download the snapshot archive'),
		files: z.array(SnapshotFileInfoSchema).optional().describe('List of files in the snapshot'),
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

export interface SnapshotFileInfo {
	path: string;
	size: number;
}

export interface SnapshotInfo {
	snapshotId: string;
	tag?: string | null;
	sizeBytes: number;
	fileCount: number;
	parentSnapshotId?: string | null;
	createdAt: string;
	downloadUrl?: string;
	files?: SnapshotFileInfo[];
}

export interface SnapshotCreateParams {
	sandboxId: string;
	tag?: string;
	orgId?: string;
}

export interface SnapshotGetParams {
	snapshotId: string;
	orgId?: string;
}

export interface SnapshotListParams {
	sandboxId?: string;
	limit?: number;
	offset?: number;
	orgId?: string;
}

export interface SnapshotListResponse {
	snapshots: SnapshotInfo[];
	total: number;
}

export interface SnapshotDeleteParams {
	snapshotId: string;
	orgId?: string;
}

export interface SnapshotTagParams {
	snapshotId: string;
	tag: string | null;
	orgId?: string;
}

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
	const { sandboxId, tag, orgId } = params;
	const queryString = buildQueryString({ orgId });
	const url = `/sandbox/${SNAPSHOT_API_VERSION}/${sandboxId}/snapshot${queryString}`;

	const body: Record<string, string> = {};
	if (tag) {
		body.tag = tag;
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
	const url = `/sandbox/${SNAPSHOT_API_VERSION}/snapshots/${snapshotId}${queryString}`;

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
	const url = `/sandbox/${SNAPSHOT_API_VERSION}/snapshots${queryString}`;

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
	const url = `/sandbox/${SNAPSHOT_API_VERSION}/snapshots/${snapshotId}${queryString}`;

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
	const url = `/sandbox/${SNAPSHOT_API_VERSION}/snapshots/${snapshotId}${queryString}`;

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
