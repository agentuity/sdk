import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ListSandboxesParams, ListSandboxesResponse, SandboxStatus } from '@agentuity/core';

const SandboxInfoSchema = z.object({
	sandboxId: z.string(),
	status: z.enum(['creating', 'idle', 'running', 'terminated', 'failed']),
	createdAt: z.string(),
	executions: z.number(),
	stdoutStreamUrl: z.string().optional(),
	stderrStreamUrl: z.string().optional(),
});

const ListSandboxesDataSchema = z.object({
	sandboxes: z.array(SandboxInfoSchema),
	total: z.number(),
});

const ListSandboxesResponseSchema = APIResponseSchema(ListSandboxesDataSchema);

export interface SandboxListParams extends ListSandboxesParams {
	orgId?: string;
}

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
				executions: s.executions,
				stdoutStreamUrl: s.stdoutStreamUrl,
				stderrStreamUrl: s.stderrStreamUrl,
			})),
			total: resp.data.total,
		};
	}

	throw new SandboxResponseError({ message: resp.message });
}
