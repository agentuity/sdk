import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ListSandboxesParams, ListSandboxesResponse, SandboxStatus } from '@agentuity/core';

const SandboxInfoSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the sandbox'),
		status: z
			.enum(['creating', 'idle', 'running', 'terminated', 'failed'])
			.describe('Current status of the sandbox'),
		createdAt: z.string().describe('ISO timestamp when the sandbox was created'),
		region: z.string().optional().describe('Region where the sandbox is running'),
		snapshotId: z.string().optional().describe('Snapshot ID this sandbox was created from'),
		snapshotTag: z.string().optional().describe('Snapshot tag this sandbox was created from'),
		executions: z.number().describe('Total number of executions in this sandbox'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
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
				status: s.status as SandboxStatus,
				createdAt: s.createdAt,
				region: s.region,
				snapshotId: s.snapshotId,
				snapshotTag: s.snapshotTag,
				executions: s.executions,
				stdoutStreamUrl: s.stdoutStreamUrl,
				stderrStreamUrl: s.stderrStreamUrl,
			})),
			total: resp.data.total,
		};
	}

	throw new SandboxResponseError({ message: resp.message });
}
