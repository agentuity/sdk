import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ExecuteOptions, Execution, ExecutionStatus } from '@agentuity/core';

const ExecuteRequestSchema = z
	.object({
		command: z.array(z.string()).describe('Command and arguments to execute'),
		files: z
			.record(z.string(), z.string())
			.optional()
			.describe('Files to write before execution (path -> content)'),
		timeout: z.string().optional().describe('Execution timeout (e.g., "30s", "5m")'),
		stream: z
			.object({
				stdout: z.string().optional().describe('Stream ID for stdout output'),
				stderr: z.string().optional().describe('Stream ID for stderr output'),
				timestamps: z.boolean().optional().describe('Whether to include timestamps in output'),
			})
			.optional()
			.describe('Stream configuration for output redirection'),
	})
	.describe('Request body for executing a command in a sandbox');

const ExecuteDataSchema = z
	.object({
		executionId: z.string().describe('Unique identifier for the execution'),
		status: z
			.enum(['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'])
			.describe('Current status of the execution'),
		exitCode: z.number().optional().describe('Exit code of the executed command'),
		durationMs: z.number().optional().describe('Execution duration in milliseconds'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
	})
	.describe('Response data from command execution');

const ExecuteResponseSchema = APIResponseSchema(ExecuteDataSchema);

export interface SandboxExecuteParams {
	sandboxId: string;
	options: ExecuteOptions;
	orgId?: string;
}

/**
 * Executes a command in an existing sandbox.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID and execution options
 * @returns The execution result including status and stream URLs
 * @throws {SandboxResponseError} If the execution request fails
 */
export async function sandboxExecute(
	client: APIClient,
	params: SandboxExecuteParams
): Promise<Execution> {
	const { sandboxId, options, orgId } = params;
	const body: z.infer<typeof ExecuteRequestSchema> = {
		command: options.command,
	};

	if (options.files) {
		body.files = options.files;
	}
	if (options.timeout) {
		body.timeout = options.timeout;
	}
	if (options.stream) {
		body.stream = options.stream;
	}

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}/${sandboxId}/execute${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof ExecuteResponseSchema>>(
		url,
		body,
		ExecuteResponseSchema,
		ExecuteRequestSchema
	);

	if (resp.success) {
		return {
			executionId: resp.data.executionId,
			status: resp.data.status as ExecutionStatus,
			exitCode: resp.data.exitCode,
			durationMs: resp.data.durationMs,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
		};
	}

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}
