import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { SandboxInfo, SandboxStatus } from '@agentuity/core';

const SandboxResourcesSchema = z
	.object({
		memory: z.string().optional().describe('Memory limit (e.g., "512Mi", "1Gi")'),
		cpu: z.string().optional().describe('CPU limit in millicores (e.g., "500m", "1000m")'),
		disk: z.string().optional().describe('Disk limit (e.g., "1Gi", "10Gi")'),
	})
	.describe('Resource limits for the sandbox');

const SandboxInfoDataSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the sandbox'),
		name: z.string().optional().describe('Sandbox name'),
		description: z.string().optional().describe('Sandbox description'),
		status: z
			.enum(['creating', 'idle', 'running', 'terminated', 'failed', 'deleted'])
			.describe('Current status of the sandbox'),
		mode: z.string().optional().describe('Sandbox mode (interactive or oneshot)'),
		createdAt: z.string().describe('ISO timestamp when the sandbox was created'),
		region: z.string().optional().describe('Region where the sandbox is running'),
		runtimeId: z.string().optional().describe('Runtime ID'),
		runtimeName: z.string().optional().describe('Runtime name (e.g., "bun:1")'),
		runtimeIconUrl: z.string().optional().describe('URL for runtime icon'),
		snapshotId: z.string().optional().describe('Snapshot ID this sandbox was created from'),
		snapshotTag: z.string().optional().describe('Snapshot tag this sandbox was created from'),
		executions: z.number().describe('Total number of executions in this sandbox'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
		dependencies: z
			.array(z.string())
			.optional()
			.describe('Apt packages installed in the sandbox'),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('User-defined metadata associated with the sandbox'),
		resources: SandboxResourcesSchema.optional().describe('Resource limits for this sandbox'),
		cpuTimeMs: z.number().optional().describe('Total CPU time consumed in milliseconds'),
		memoryByteSec: z.number().optional().describe('Total memory usage in byte-seconds'),
		networkEgressBytes: z.number().optional().describe('Total network egress in bytes'),
		networkEnabled: z.boolean().optional().describe('Whether network access is enabled'),
	})
	.describe('Detailed information about a sandbox');

const SandboxGetResponseSchema = APIResponseSchema(SandboxInfoDataSchema);

export interface SandboxGetParams {
	sandboxId: string;
	orgId?: string;
	includeDeleted?: boolean;
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
	const { sandboxId, orgId, includeDeleted } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	if (includeDeleted) {
		queryParams.set('includeDeleted', 'true');
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
			name: resp.data.name,
			description: resp.data.description,
			status: resp.data.status as SandboxStatus,
			mode: resp.data.mode,
			createdAt: resp.data.createdAt,
			region: resp.data.region,
			runtimeId: resp.data.runtimeId,
			runtimeName: resp.data.runtimeName,
			runtimeIconUrl: resp.data.runtimeIconUrl,
			snapshotId: resp.data.snapshotId,
			snapshotTag: resp.data.snapshotTag,
			executions: resp.data.executions,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
			dependencies: resp.data.dependencies,
			metadata: resp.data.metadata as Record<string, unknown> | undefined,
			resources: resp.data.resources,
			cpuTimeMs: resp.data.cpuTimeMs,
			memoryByteSec: resp.data.memoryByteSec,
			networkEgressBytes: resp.data.networkEgressBytes,
			networkEnabled: resp.data.networkEnabled,
		};
	}

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}
