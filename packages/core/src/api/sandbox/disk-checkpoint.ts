import type { z as zType } from 'zod';
import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api.ts';
import { throwSandboxError } from './util.ts';

// --- Schemas ---

export const DiskCheckpointInfoSchema = z.object({
	id: z.string().describe('Globally unique checkpoint ID (ckpt_xxx)'),
	name: z.string().describe('User-provided checkpoint name'),
	createdAt: z.string().describe('ISO timestamp of creation'),
	parent: z.string().describe('Parent checkpoint name (empty for base)'),
});

export type DiskCheckpointInfo = z.infer<typeof DiskCheckpointInfoSchema>;

const CreateDiskCheckpointDataSchema = DiskCheckpointInfoSchema;
export const CreateDiskCheckpointResponseSchema = APIResponseSchema(CreateDiskCheckpointDataSchema);

const ListDiskCheckpointsDataSchema = z.object({
	checkpoints: z.array(DiskCheckpointInfoSchema),
});
export const ListDiskCheckpointsResponseSchema = APIResponseSchema(ListDiskCheckpointsDataSchema);

export const RestoreDiskCheckpointResponseSchema = APIResponseSchemaNoData();
export const DeleteDiskCheckpointResponseSchema = APIResponseSchemaNoData();

// --- Params ---

export interface DiskCheckpointCreateParams {
	sandboxId: string;
	name: string;
	orgId?: string;
}

export interface DiskCheckpointListParams {
	sandboxId: string;
	orgId?: string;
}

export interface DiskCheckpointRestoreParams {
	sandboxId: string;
	checkpointId: string;
	orgId?: string;
}

export interface DiskCheckpointDeleteParams {
	sandboxId: string;
	checkpointId: string;
	orgId?: string;
}

// --- API Functions ---

/**
 * Creates a new disk checkpoint for a sandbox.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID and checkpoint name
 * @throws {SandboxResponseError} If the sandbox is not found or checkpoint creation fails
 */
export async function diskCheckpointCreate(
	client: APIClient,
	params: DiskCheckpointCreateParams
): Promise<DiskCheckpointInfo> {
	const { sandboxId, name, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${encodeURIComponent(sandboxId)}/checkpoint${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<zType.infer<typeof CreateDiskCheckpointResponseSchema>>(
		url,
		{ name },
		CreateDiskCheckpointResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, { sandboxId });
}

/**
 * Lists all disk checkpoints for a sandbox.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID
 * @throws {SandboxResponseError} If the sandbox is not found or listing fails
 */
export async function diskCheckpointList(
	client: APIClient,
	params: DiskCheckpointListParams
): Promise<DiskCheckpointInfo[]> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/checkpoints/${encodeURIComponent(sandboxId)}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<zType.infer<typeof ListDiskCheckpointsResponseSchema>>(
		url,
		ListDiskCheckpointsResponseSchema
	);

	if (resp.success) {
		return resp.data.checkpoints;
	}

	throwSandboxError(resp, { sandboxId });
}

/**
 * Restores a sandbox to a specific disk checkpoint.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID and checkpoint ID
 * @throws {SandboxResponseError} If the sandbox or checkpoint is not found, or restore fails
 */
export async function diskCheckpointRestore(
	client: APIClient,
	params: DiskCheckpointRestoreParams
): Promise<void> {
	const { sandboxId, checkpointId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${encodeURIComponent(sandboxId)}/checkpoint/${encodeURIComponent(checkpointId)}/restore${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<zType.infer<typeof RestoreDiskCheckpointResponseSchema>>(
		url,
		undefined,
		RestoreDiskCheckpointResponseSchema
	);

	if (resp.success) {
		return;
	}

	throwSandboxError(resp, { sandboxId });
}

/**
 * Deletes a disk checkpoint from a sandbox.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID and checkpoint ID
 * @throws {SandboxResponseError} If the sandbox or checkpoint is not found, or deletion fails
 */
export async function diskCheckpointDelete(
	client: APIClient,
	params: DiskCheckpointDeleteParams
): Promise<void> {
	const { sandboxId, checkpointId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${encodeURIComponent(sandboxId)}/checkpoint/${encodeURIComponent(checkpointId)}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.delete<zType.infer<typeof DeleteDiskCheckpointResponseSchema>>(
		url,
		DeleteDiskCheckpointResponseSchema
	);

	if (resp.success) {
		return;
	}

	throwSandboxError(resp, { sandboxId });
}
