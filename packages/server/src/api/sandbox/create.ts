import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { SandboxCreateOptions, SandboxStatus } from '@agentuity/core';

const SandboxCreateRequestSchema = z
	.object({
		resources: z
			.object({
				memory: z.string().optional().describe('Memory limit (e.g., "512Mi", "1Gi")'),
				cpu: z.string().optional().describe('CPU limit (e.g., "0.5", "1")'),
				disk: z.string().optional().describe('Disk size limit (e.g., "1Gi", "10Gi")'),
			})
			.optional()
			.describe('Resource constraints for the sandbox'),
		env: z
			.record(z.string(), z.string())
			.optional()
			.describe('Environment variables to set in the sandbox'),
		network: z
			.object({
				enabled: z.boolean().optional().describe('Whether network access is enabled'),
			})
			.optional()
			.describe('Network configuration for the sandbox'),
		stream: z
			.object({
				stdout: z.string().optional().describe('Stream ID for stdout output'),
				stderr: z.string().optional().describe('Stream ID for stderr output'),
				stdin: z.string().optional().describe('Stream ID for stdin input'),
				timestamps: z.boolean().optional().describe('Whether to include timestamps in output'),
			})
			.optional()
			.describe('Stream configuration for I/O redirection'),
		timeout: z
			.object({
				idle: z.string().optional().describe('Idle timeout duration (e.g., "5m", "1h")'),
				execution: z.string().optional().describe('Maximum execution time (e.g., "30m", "2h")'),
			})
			.optional()
			.describe('Timeout settings for the sandbox'),
		command: z
			.object({
				exec: z.array(z.string()).describe('Command and arguments to execute'),
				files: z
					.record(z.string(), z.string())
					.optional()
					.describe('Files to write before execution (path -> content)'),
				mode: z
					.enum(['oneshot', 'interactive'])
					.optional()
					.describe('Execution mode: oneshot runs once, interactive keeps running'),
			})
			.optional()
			.describe('Initial command to run in the sandbox'),
		snapshot: z.string().optional().describe('Snapshot ID to restore the sandbox from'),
	})
	.describe('Request body for creating a new sandbox');

const SandboxCreateDataSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the created sandbox'),
		status: z
			.enum(['creating', 'idle', 'running', 'terminated', 'failed'])
			.describe('Current status of the sandbox'),
		stdoutStreamId: z.string().optional().describe('Stream ID for reading stdout'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamId: z.string().optional().describe('Stream ID for reading stderr'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
	})
	.describe('Response data from sandbox creation');

const SandboxCreateResponseSchema = APIResponseSchema(SandboxCreateDataSchema);

export interface SandboxCreateResponse {
	sandboxId: string;
	status: SandboxStatus;
	stdoutStreamId?: string;
	stdoutStreamUrl?: string;
	stderrStreamId?: string;
	stderrStreamUrl?: string;
}

export interface SandboxCreateParams {
	options?: SandboxCreateOptions;
	orgId?: string;
}

/**
 * Creates a new sandbox instance.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters for creating the sandbox
 * @returns The created sandbox response including sandbox ID and stream URLs
 * @throws {SandboxResponseError} If the sandbox creation fails
 */
export async function sandboxCreate(
	client: APIClient,
	params: SandboxCreateParams = {}
): Promise<SandboxCreateResponse> {
	const { options = {}, orgId } = params;
	const body: z.infer<typeof SandboxCreateRequestSchema> = {};

	if (options.resources) {
		body.resources = options.resources;
	}
	if (options.env) {
		body.env = options.env;
	}
	if (options.network) {
		body.network = options.network;
	}
	if (options.stream) {
		body.stream = options.stream;
	}
	if (options.timeout) {
		body.timeout = options.timeout;
	}
	if (options.command) {
		body.command = options.command;
	}
	if (options.snapshot) {
		body.snapshot = options.snapshot;
	}

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof SandboxCreateResponseSchema>>(
		url,
		body,
		SandboxCreateResponseSchema,
		SandboxCreateRequestSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}
