import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { throwSandboxError } from './util.ts';

const SandboxStatusDataSchema = z.object({
	sandboxId: z.string(),
	status: z.string(),
	exitCode: z.number().optional(),
});

const SandboxStatusResponseSchema = APIResponseSchema(SandboxStatusDataSchema);

export interface SandboxGetStatusParams {
	sandboxId: string;
	orgId?: string;
}

export interface SandboxStatusResult {
	sandboxId: string;
	status: string;
	exitCode?: number;
}

/**
 * Retrieves lightweight sandbox status (status + exitCode only).
 * Optimized for the sandbox run flow — backed by Redis for ~1ms response time.
 */
export async function sandboxGetStatus(
	client: APIClient,
	params: SandboxGetStatusParams
): Promise<SandboxStatusResult> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/status/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof SandboxStatusResponseSchema>>(
		url,
		SandboxStatusResponseSchema
	);

	if (resp.success) {
		return {
			sandboxId: resp.data.sandboxId,
			status: resp.data.status,
			exitCode: resp.data.exitCode,
		};
	}

	throwSandboxError(resp, { sandboxId });
}
