import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { SandboxInfo, SandboxStatus } from '@agentuity/core';

const SandboxInfoDataSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the sandbox'),
		status: z
			.enum(['creating', 'idle', 'running', 'terminated', 'failed'])
			.describe('Current status of the sandbox'),
		createdAt: z.string().describe('ISO timestamp when the sandbox was created'),
		executions: z.number().describe('Total number of executions in this sandbox'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
	})
	.describe('Detailed information about a sandbox');

const SandboxGetResponseSchema = APIResponseSchema(SandboxInfoDataSchema);

export interface SandboxGetParams {
	sandboxId: string;
	orgId?: string;
}

/**
 * Retrieves information about a specific sandbox.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID
 * @returns Sandbox information including status, creation time, and execution count
 * @throws {SandboxResponseError} If the sandbox is not found or request fails
 */
export async function sandboxGet(
	client: APIClient,
	params: SandboxGetParams
): Promise<SandboxInfo> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof SandboxGetResponseSchema>>(
		url,
		SandboxGetResponseSchema
	);

	if (resp.success) {
		return {
			sandboxId: resp.data.sandboxId,
			status: resp.data.status as SandboxStatus,
			createdAt: resp.data.createdAt,
			executions: resp.data.executions,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
		};
	}

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}
