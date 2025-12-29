import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ExecutionStatus } from '@agentuity/core';

const ExecutionDataSchema = z
	.object({
		executionId: z.string().describe('Unique identifier for the execution'),
		sandboxId: z.string().describe('ID of the sandbox where the execution ran'),
		status: z
			.enum(['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'])
			.describe('Current status of the execution'),
		exitCode: z.number().optional().describe('Exit code of the executed command'),
		durationMs: z.number().optional().describe('Execution duration in milliseconds'),
		startedAt: z.string().optional().describe('ISO timestamp when execution started'),
		completedAt: z.string().optional().describe('ISO timestamp when execution completed'),
		error: z.string().optional().describe('Error message if execution failed'),
	})
	.describe('Detailed information about a command execution');

const ExecutionGetResponseSchema = APIResponseSchema(ExecutionDataSchema);

export interface ExecutionInfo {
	executionId: string;
	sandboxId: string;
	status: ExecutionStatus;
	exitCode?: number;
	durationMs?: number;
	startedAt?: string;
	completedAt?: string;
	error?: string;
}

export interface ExecutionGetParams {
	executionId: string;
	orgId?: string;
}

/**
 * Retrieves detailed information about a specific execution.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the execution ID
 * @returns Detailed execution information including status, timing, and errors
 * @throws {SandboxResponseError} If the execution is not found or request fails
 */
export async function executionGet(
	client: APIClient,
	params: ExecutionGetParams
): Promise<ExecutionInfo> {
	const { executionId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}/executions/${executionId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ExecutionGetResponseSchema>>(
		url,
		ExecutionGetResponseSchema
	);

	if (resp.success) {
		return {
			executionId: resp.data.executionId,
			sandboxId: resp.data.sandboxId,
			status: resp.data.status as ExecutionStatus,
			exitCode: resp.data.exitCode,
			durationMs: resp.data.durationMs,
			startedAt: resp.data.startedAt,
			completedAt: resp.data.completedAt,
			error: resp.data.error,
		};
	}

	throw new SandboxResponseError({ message: resp.message, executionId });
}
