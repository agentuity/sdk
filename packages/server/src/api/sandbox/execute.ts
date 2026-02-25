import type { ExecuteOptions, Execution, ExecutionStatus } from '@agentuity/core';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { API_VERSION, SandboxBusyError, throwSandboxError } from './util.ts';

export const ExecuteRequestSchema = z
	.object({
		command: z.array(z.string()).describe('Command and arguments to execute'),
		files: z
			.array(
				z.object({
					path: z.string().describe('File path relative to workspace'),
					content: z.string().describe('Base64-encoded file content'),
				})
			)
			.optional()
			.describe('Files to write before execution'),
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
		body.files = options.files.map((f) => ({
			path: f.path,
			content: f.content.toString('base64'),
		}));
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

	let resp: z.infer<typeof ExecuteResponseSchema>;
	try {
		resp = await client.post<z.infer<typeof ExecuteResponseSchema>>(
			url,
			body,
			ExecuteResponseSchema,
			ExecuteRequestSchema,
			signal ?? options.signal
		);
	} catch (error: unknown) {
		// Detect 409 Conflict (sandbox busy) and throw a specific error.
		// The sandbox API client is configured with maxRetries: 0 to fail fast
		// when sandbox is busy (retrying wouldn't help - sandbox is still busy).
		// Convert APIErrorResponse with status 409 to SandboxBusyError for clarity.
		if (
			error &&
			typeof error === 'object' &&
			'_tag' in error &&
			(error as { _tag: string })._tag === 'APIErrorResponse' &&
			'status' in error &&
			(error as { status: number }).status === 409
		) {
			throw new SandboxBusyError({
				message:
					'Sandbox is currently busy executing another command. Please wait for the current execution to complete before submitting a new one.',
				sandboxId,
			});
		}
		throw error;
	}

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
