import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ExecutionStatus } from '@agentuity/core';

const ExecutionInfoSchema = z
	.object({
		executionId: z.string().describe('Unique identifier for the execution'),
		sandboxId: z.string().describe('ID of the sandbox where the execution ran'),
		status: z
			.enum(['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'])
			.describe('Current status of the execution'),
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

const ExecutionGetResponseSchema = APIResponseSchema(ExecutionInfoSchema);

const ExecutionListDataSchema = z
	.object({
		executions: z.array(ExecutionInfoSchema).describe('List of executions'),
	})
	.describe('List of executions for a sandbox');

const ExecutionListResponseSchema = APIResponseSchema(ExecutionListDataSchema);

export interface ExecutionInfo {
	executionId: string;
	sandboxId: string;
	status: ExecutionStatus;
	command?: string[];
	exitCode?: number;
	durationMs?: number;
	startedAt?: string;
	completedAt?: string;
	error?: string;
	stdoutStreamUrl?: string;
	stderrStreamUrl?: string;
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
	const url = `/sandbox/${API_VERSION}/execution/${executionId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ExecutionGetResponseSchema>>(
		url,
		ExecutionGetResponseSchema
	);

	if (resp.success) {
		return {
			executionId: resp.data.executionId,
			sandboxId: resp.data.sandboxId,
			status: resp.data.status as ExecutionStatus,
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

	throw new SandboxResponseError({ message: resp.message, executionId });
}

export interface ExecutionListParams {
	sandboxId: string;
	orgId?: string;
	limit?: number;
}

export interface ExecutionListResponse {
	executions: ExecutionInfo[];
}

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
	const url = `/sandbox/${API_VERSION}/sandboxes/${sandboxId}/executions${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ExecutionListResponseSchema>>(
		url,
		ExecutionListResponseSchema
	);

	if (resp.success) {
		return {
			executions: resp.data.executions.map((exec) => ({
				executionId: exec.executionId,
				sandboxId: exec.sandboxId,
				status: exec.status as ExecutionStatus,
				command: exec.command,
				exitCode: exec.exitCode,
				durationMs: exec.durationMs,
				startedAt: exec.startedAt,
				completedAt: exec.completedAt,
				error: exec.error,
				stdoutStreamUrl: exec.stdoutStreamUrl,
				stderrStreamUrl: exec.stderrStreamUrl,
			})),
		};
	}

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}
