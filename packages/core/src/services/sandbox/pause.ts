import { z } from 'zod';
import { type APIClient } from '../api.ts';
import { throwSandboxError } from './util.ts';

export const PauseResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string(),
		code: z.string().optional(),
	}),
	z.object({
		success: z.literal<true>(true),
		sandboxId: z.string(),
		status: z.string(),
		checkpointId: z.string().optional(),
		terminatesAt: z.string().optional(),
	}),
]);

export const SandboxPauseParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to pause'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
});

export type SandboxPauseParams = z.infer<typeof SandboxPauseParamsSchema>;

/** Result returned from pausing a sandbox */
export interface SandboxPauseResult {
	/** The sandbox ID that was paused */
	sandboxId: string;
	/** New status (typically "suspended") */
	status: string;
	/** Checkpoint ID created during pause */
	checkpointId?: string;
	/** ISO 8601 timestamp when sandbox will auto-terminate if not resumed (omitted if no paused timeout) */
	terminatesAt?: string;
}

/**
 * Pauses a running sandbox, creating a checkpoint of its current state.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID to pause
 * @returns Pause result including terminatesAt if a paused timeout is configured
 * @throws {SandboxResponseError} If the sandbox is not found or pause fails
 */
export async function sandboxPause(
	client: APIClient,
	params: SandboxPauseParams
): Promise<SandboxPauseResult> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${encodeURIComponent(sandboxId)}/pause${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof PauseResponseSchema>>(
		url,
		undefined,
		PauseResponseSchema
	);

	if (resp.success) {
		return {
			sandboxId: resp.sandboxId,
			status: resp.status,
			checkpointId: resp.checkpointId,
			terminatesAt: resp.terminatesAt,
		};
	}

	throwSandboxError(resp, { sandboxId });
}
