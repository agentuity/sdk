import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { SandboxInfo, SandboxStatus } from '@agentuity/core';

const SandboxInfoDataSchema = z.object({
	sandboxId: z.string(),
	status: z.enum(['creating', 'idle', 'running', 'terminated', 'failed']),
	createdAt: z.string(),
	executions: z.number(),
	stdoutStreamUrl: z.string().optional(),
	stderrStreamUrl: z.string().optional(),
});

const SandboxGetResponseSchema = APIResponseSchema(SandboxInfoDataSchema);

export interface SandboxGetParams {
	sandboxId: string;
	orgId?: string;
}

export async function sandboxGet(client: APIClient, params: SandboxGetParams): Promise<SandboxInfo> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof SandboxGetResponseSchema>>(
		url,
		SandboxGetResponseSchema
	);

	if (resp.success) {
		return {
			sandboxId: resp.data.sandboxId,
			status: resp.data.status as SandboxStatus,
			createdAt: resp.data.createdAt,
			executions: resp.data.executions,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
		};
	}

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}
