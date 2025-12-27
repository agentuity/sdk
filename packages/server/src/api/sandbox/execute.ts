import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ExecuteOptions, Execution, ExecutionStatus } from '@agentuity/core';

const ExecuteRequestSchema = z.object({
	command: z.array(z.string()),
	files: z.record(z.string(), z.string()).optional(),
	timeout: z.string().optional(),
	stream: z
		.object({
			stdout: z.string().optional(),
			stderr: z.string().optional(),
			timestamps: z.boolean().optional(),
		})
		.optional(),
});

const ExecuteDataSchema = z.object({
	executionId: z.string(),
	status: z.enum(['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled']),
	exitCode: z.number().optional(),
	durationMs: z.number().optional(),
	stdoutStreamUrl: z.string().optional(),
	stderrStreamUrl: z.string().optional(),
});

const ExecuteResponseSchema = APIResponseSchema(ExecuteDataSchema);

export interface SandboxExecuteParams {
	sandboxId: string;
	options: ExecuteOptions;
	orgId?: string;
}

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
