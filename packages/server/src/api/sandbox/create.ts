import type { SandboxCreateOptions, SandboxStatus } from '@agentuity/core';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { NPM_PACKAGE_NAME_PATTERN } from './snapshot-build.ts';
import { API_VERSION, throwSandboxError } from './util.ts';

export const SandboxCreateRequestSchema = z
	.object({
		projectId: z.string().optional().describe('Project ID to associate the sandbox with'),
		runtime: z.string().optional().describe('Runtime name (e.g., "bun:1", "python:3.14")'),
		runtimeId: z.string().optional().describe('Runtime ID (e.g., "srt_xxx")'),
		name: z.string().optional().describe('Optional sandbox name'),
		description: z.string().optional().describe('Optional sandbox description'),
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
				port: z
					.number()
					.int()
					.min(1024)
					.max(65535)
					.optional()
					.describe('Port to expose from the sandbox (1024-65535)'),
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
					.array(
						z.object({
							path: z
								.string()
								.describe('Path to the file relative to the sandbox workspace'),
							content: z.string().describe('Base64-encoded file content'),
						})
					)
					.optional()
					.describe('Files to write before execution (deprecated: use top-level files)'),
				mode: z
					.enum(['oneshot', 'interactive'])
					.optional()
					.describe('Execution mode: oneshot runs once, interactive keeps running'),
			})
			.optional()
			.describe('Initial command to run in the sandbox'),
		files: z
			.array(
				z.object({
					path: z.string().describe('Path to the file relative to the sandbox workspace'),
					content: z.string().describe('Base64-encoded file content'),
				})
			)
			.optional()
			.describe('Files to write to sandbox on creation'),
		snapshot: z.string().optional().describe('Snapshot ID to restore the sandbox from'),
		dependencies: z
			.array(z.string())
			.optional()
			.describe('Apt packages to install when creating the sandbox'),
		packages: z
			.array(
				z
					.string()
					.regex(
						NPM_PACKAGE_NAME_PATTERN,
						'Invalid npm/bun package specifier: must not contain whitespace, semicolons, backticks, pipes, or dollar signs'
					)
			)
			.optional()
			.describe('npm/bun packages to install globally when creating the sandbox'),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('Optional user-defined metadata to associate with the sandbox'),
	})
	.refine(
		(data) => {
			// If snapshot is provided, runtime and runtimeId must not be provided
			if (data.snapshot) {
				return !data.runtime && !data.runtimeId;
			}
			return true;
		},
		{
			message: 'cannot specify both snapshot and runtime; snapshot includes its own runtime',
			path: ['snapshot'],
		}
	)
	.describe('Request body for creating a new sandbox');

export const SandboxCreateDataSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the created sandbox'),
		status: z
			.enum([
				'creating',
				'idle',
				'running',
				'paused',
				'stopping',
				'suspended',
				'terminated',
				'failed',
			])
			.describe('Current status of the sandbox'),
		stdoutStreamId: z.string().optional().describe('Stream ID for reading stdout'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamId: z.string().optional().describe('Stream ID for reading stderr'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
	})
	.describe('Response data from sandbox creation');

export const SandboxCreateResponseSchema = APIResponseSchema(SandboxCreateDataSchema);

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

	if (options.projectId) {
		body.projectId = options.projectId;
	}
	if (options.runtime) {
		body.runtime = options.runtime;
	}
	if (options.runtimeId) {
		body.runtimeId = options.runtimeId;
	}
	if (options.name) {
		body.name = options.name;
	}
	if (options.description) {
		body.description = options.description;
	}
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
		body.command = {
			exec: options.command.exec,
			mode: options.command.mode,
			files: options.command.files?.map((f) => ({
				path: f.path,
				content: f.content.toString('base64'),
			})),
		};
	}
	if (options.files && options.files.length > 0) {
		body.files = options.files.map((f) => ({
			path: f.path,
			content: f.content.toString('base64'),
		}));
	}
	if (options.snapshot) {
		body.snapshot = options.snapshot;
	}
	if (options.dependencies && options.dependencies.length > 0) {
		body.dependencies = options.dependencies;
	}
	if (options.packages && options.packages.length > 0) {
		body.packages = options.packages;
	}
	if (options.metadata) {
		body.metadata = options.metadata;
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

	throwSandboxError(resp, {});
}
