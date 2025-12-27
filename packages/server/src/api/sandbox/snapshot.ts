import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError } from './util';

const SNAPSHOT_API_VERSION = '2025-06-26';

const SnapshotFileInfoSchema = z.object({
	path: z.string(),
	size: z.number(),
});

const SnapshotInfoSchema = z.object({
	snapshotId: z.string(),
	sandboxId: z.string(),
	tag: z.string().nullable().optional(),
	sizeBytes: z.number(),
	fileCount: z.number(),
	parentSnapshotId: z.string().nullable().optional(),
	createdAt: z.string(),
	downloadUrl: z.string().optional(),
	files: z.array(SnapshotFileInfoSchema).optional(),
});

const SnapshotCreateResponseSchema = APIResponseSchema(SnapshotInfoSchema);
const SnapshotGetResponseSchema = APIResponseSchema(SnapshotInfoSchema);
const SnapshotListDataSchema = z.object({
	snapshots: z.array(SnapshotInfoSchema),
	total: z.number(),
});
const SnapshotListResponseSchema = APIResponseSchema(SnapshotListDataSchema);
const SnapshotDeleteResponseSchema = APIResponseSchema(z.object({}));

export interface SnapshotFileInfo {
	path: string;
	size: number;
}

export interface SnapshotInfo {
	snapshotId: string;
	sandboxId: string;
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
