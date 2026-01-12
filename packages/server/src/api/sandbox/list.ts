import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ListSandboxesParams, ListSandboxesResponse, SandboxStatus } from '@agentuity/core';

const SandboxInfoSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the sandbox'),
		name: z.string().optional().describe('Sandbox name'),
		description: z.string().optional().describe('Sandbox description'),
		status: z
			.enum(['creating', 'idle', 'running', 'terminated', 'failed', 'deleted'])
			.describe('Current status of the sandbox'),
		mode: z.string().optional().describe('Sandbox mode (interactive or oneshot)'),
		createdAt: z.string().describe('ISO timestamp when the sandbox was created'),
		region: z.string().optional().describe('Region where the sandbox is running'),
		runtimeId: z.string().optional().describe('Runtime ID'),
		runtimeName: z.string().optional().describe('Runtime name (e.g., "bun:1")'),
		runtimeIconUrl: z.string().optional().describe('URL for runtime icon'),
		snapshotId: z.string().optional().describe('Snapshot ID this sandbox was created from'),
		snapshotTag: z.string().optional().describe('Snapshot tag this sandbox was created from'),
		executions: z.number().describe('Total number of executions in this sandbox'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
		networkEnabled: z.boolean().optional().describe('Whether network access is enabled'),
	})
	.describe('Summary information about a sandbox');

const ListSandboxesDataSchema = z
	.object({
		sandboxes: z.array(SandboxInfoSchema).describe('List of sandbox entries'),
		total: z.number().describe('Total number of sandboxes matching the query'),
	})
	.describe('Paginated list of sandboxes');

const ListSandboxesResponseSchema = APIResponseSchema(ListSandboxesDataSchema);

export interface SandboxListParams extends ListSandboxesParams {
	orgId?: string;
	deletedOnly?: boolean;
}

/**
 * Lists sandboxes with optional filtering and pagination.
 *
 * @param client - The API client to use for the request
 * @param params - Optional parameters for filtering by project, status, and pagination
 * @returns Paginated list of sandboxes with total count
 * @throws {SandboxResponseError} If the request fails
 */
export async function sandboxList(
	client: APIClient,
	params?: SandboxListParams
): Promise<ListSandboxesResponse> {
	const queryParams = new URLSearchParams();

	if (params?.orgId) {
		queryParams.set('orgId', params.orgId);
	}
	if (params?.projectId) {
		queryParams.set('projectId', params.projectId);
	}
	if (params?.snapshotId) {
		queryParams.set('snapshotId', params.snapshotId);
	}
	if (params?.status) {
		queryParams.set('status', params.status);
	}
	if (params?.limit !== undefined) {
		queryParams.set('limit', params.limit.toString());
	}
	if (params?.offset !== undefined) {
		queryParams.set('offset', params.offset.toString());
	}
	if (params?.deletedOnly) {
		queryParams.set('deletedOnly', 'true');
	}

	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ListSandboxesResponseSchema>>(
		url,
		ListSandboxesResponseSchema
	);

	if (resp.success) {
		return {
			sandboxes: resp.data.sandboxes.map((s) => ({
				sandboxId: s.sandboxId,
				name: s.name,
				description: s.description,
				status: s.status as SandboxStatus,
				mode: s.mode,
				createdAt: s.createdAt,
				region: s.region,
				runtimeId: s.runtimeId,
				runtimeName: s.runtimeName,
				runtimeIconUrl: s.runtimeIconUrl,
				snapshotId: s.snapshotId,
				snapshotTag: s.snapshotTag,
				executions: s.executions,
				stdoutStreamUrl: s.stdoutStreamUrl,
				stderrStreamUrl: s.stderrStreamUrl,
				networkEnabled: s.networkEnabled,
			})),
			total: resp.data.total,
		};
	}

	throw new SandboxResponseError({ message: resp.message });
}
