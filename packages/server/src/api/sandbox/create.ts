import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { SandboxCreateOptions, SandboxStatus } from '@agentuity/core';

const SandboxCreateRequestSchema = z.object({
	resources: z
		.object({
			memory: z.string().optional(),
			cpu: z.string().optional(),
			disk: z.string().optional(),
		})
		.optional(),
	env: z.record(z.string(), z.string()).optional(),
	network: z
		.object({
			enabled: z.boolean().optional(),
		})
		.optional(),
	stream: z
		.object({
			stdout: z.string().optional(),
			stderr: z.string().optional(),
			stdin: z.string().optional(),
			timestamps: z.boolean().optional(),
		})
		.optional(),
	timeout: z
		.object({
			idle: z.string().optional(),
			execution: z.string().optional(),
		})
		.optional(),
	command: z
		.object({
			exec: z.array(z.string()),
			files: z.record(z.string(), z.string()).optional(),
			mode: z.enum(['oneshot', 'interactive']).optional(),
		})
		.optional(),
	snapshot: z.string().optional(),
});

const SandboxCreateDataSchema = z.object({
	sandboxId: z.string(),
	status: z.enum(['creating', 'idle', 'running', 'terminated', 'failed']),
	stdoutStreamId: z.string().optional(),
	stdoutStreamUrl: z.string().optional(),
	stderrStreamId: z.string().optional(),
	stderrStreamUrl: z.string().optional(),
});

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
