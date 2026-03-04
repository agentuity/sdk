import { ExecutionStatusSchema } from './types.ts';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { throwSandboxError } from './util.ts';

export const ExecutionInfoSchema = z
	.object({
		executionId: z.string().describe('Unique identifier for the execution'),
		sandboxId: z.string().describe('ID of the sandbox where the execution ran'),
		type: z
			.string()
			.optional()
			.describe('Type of execution (e.g., exec, write_files, read_file)'),
		status: ExecutionStatusSchema.describe('Current status of the execution'),
		command: z.array(z.string()).optional().describe('Command that was executed'),
		exitCode: z.number().optional().describe('Exit code of the executed command'),
		durationMs: z.number().optional().describe('Execution duration in milliseconds'),
		startedAt: z.string().optional().describe('ISO timestamp when execution started'),
		completedAt: z.string().optional().describe('ISO timestamp when execution completed'),
		error: z.string().optional().describe('Error message if execution failed'),
		stdoutStreamUrl: z.string().optional().describe('URL to stream stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL to stream stderr output'),
	})
	.describe('Detailed information about a command execution');

export const ExecutionGetResponseSchema = APIResponseSchema(ExecutionInfoSchema);

export const ExecutionListDataSchema = z
	.object({
		executions: z.array(ExecutionInfoSchema).describe('List of executions'),
	})
	.describe('List of executions for a sandbox');

export const ExecutionListResponseSchema = APIResponseSchema(ExecutionListDataSchema);

export type ExecutionInfo = z.infer<typeof ExecutionInfoSchema>;

export const ExecutionGetParamsSchema = z.object({
	executionId: z.string().describe('execution id'),
	orgId: z.string().optional().describe('organization id'),
	/** Optional wait duration for long-polling. */
	wait: z.string().optional().describe('wait duration for long-polling'),
});
export type ExecutionGetParams = z.infer<typeof ExecutionGetParamsSchema>;

/**
 * Retrieves detailed information about a specific execution.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the execution ID and optional wait duration
 * @returns Detailed execution information including status, timing, and errors
 * @throws {SandboxResponseError} If the execution is not found or request fails
 *
 * @example
 * // Immediate return (current behavior)
 * const info = await executionGet(client, { executionId: 'exec_123' });
 *
 * @example
 * // Long-poll: wait up to 60 seconds for completion
 * const info = await executionGet(client, { executionId: 'exec_123', wait: '60s' });
 */
export async function executionGet(
	client: APIClient,
	params: ExecutionGetParams
): Promise<ExecutionInfo> {
	const { executionId, orgId, wait } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	if (wait) {
		queryParams.set('wait', wait);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/execution/${executionId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ExecutionGetResponseSchema>>(
		url,
		ExecutionGetResponseSchema
	);

	if (resp.success) {
		return {
			executionId: resp.data.executionId,
			sandboxId: resp.data.sandboxId,
			type: resp.data.type,
			status: resp.data.status,
			command: resp.data.command,
			exitCode: resp.data.exitCode,
			durationMs: resp.data.durationMs,
			startedAt: resp.data.startedAt,
			completedAt: resp.data.completedAt,
			error: resp.data.error,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
		};
	}

	throwSandboxError(resp, { executionId });
}

export const ExecutionListParamsSchema = z.object({
	sandboxId: z.string().describe('sandbox id'),
	orgId: z.string().optional().describe('organization id'),
	limit: z.number().optional().describe('limit'),
});
export type ExecutionListParams = z.infer<typeof ExecutionListParamsSchema>;

export type ExecutionListResponse = z.infer<typeof ExecutionListDataSchema>;

/**
 * Lists all executions for a specific sandbox.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID and optional limit
 * @returns List of execution information for the sandbox
 * @throws {SandboxResponseError} If the sandbox is not found or request fails
 */
export async function executionList(
	client: APIClient,
	params: ExecutionListParams
): Promise<ExecutionListResponse> {
	const { sandboxId, orgId, limit } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	if (limit !== undefined) {
		queryParams.set('limit', String(limit));
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/sandboxes/${sandboxId}/executions${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ExecutionListResponseSchema>>(
		url,
		ExecutionListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, { sandboxId });
}
