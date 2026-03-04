import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { throwSandboxError } from './util.ts';

const SandboxStatusDataSchema = z.object({
	sandboxId: z.string().describe('Unique identifier for the sandbox.'),
	status: z.string().describe('Current status of the sandbox.'),
	exitCode: z.number().optional().describe('Exit code from the last execution, if terminated.'),
});

const SandboxStatusResponseSchema = APIResponseSchema(SandboxStatusDataSchema);

export const SandboxGetStatusParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to retrieve status for'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
});

export type SandboxGetStatusParams = z.infer<typeof SandboxGetStatusParamsSchema>;
export type SandboxStatusResult = z.infer<typeof SandboxStatusDataSchema>;

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
