import type { ExecuteOptions, Execution, ExecutionStatus } from '@agentuity/core';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api';
import { API_VERSION, throwSandboxError } from './util';

export const ExecuteRequestSchema = z
	.object({
		command: z.array(z.string()).describe('Command and arguments to execute'),
		files: z
			.record(z.string(), z.string())
			.optional()
			.describe('Files to write before execution (path -> base64 content)'),
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

export const ExecuteDataSchema = z
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

export const ExecuteResponseSchema = APIResponseSchema(ExecuteDataSchema);

export interface SandboxExecuteParams {
	sandboxId: string;
	options: ExecuteOptions;
	orgId?: string;
	signal?: AbortSignal;
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
	const { sandboxId, options, orgId, signal } = params;
	const body: z.infer<typeof ExecuteRequestSchema> = {
		command: options.command,
	};

	if (options.files && options.files.length > 0) {
		body.files = Object.fromEntries(
			options.files.map((f) => [f.path, f.content.toString('base64')])
		);
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
		ExecuteRequestSchema,
		signal ?? options.signal
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

	throwSandboxError(resp, { sandboxId });
}
