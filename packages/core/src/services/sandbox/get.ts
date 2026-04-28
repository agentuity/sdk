import type {
	SandboxInfo,
	SandboxRuntimeInfo,
	SandboxSnapshotInfo,
	SandboxStatus,
} from './types.ts';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { throwSandboxError } from './util.ts';

export const SandboxResourcesSchema = z
	.object({
		memory: z.string().optional().describe('Memory limit (e.g., "512Mi", "1Gi")'),
		cpu: z.string().optional().describe('CPU limit in millicores (e.g., "500m", "1000m")'),
		disk: z.string().optional().describe('Disk limit (e.g., "1Gi", "10Gi")'),
	})
	.describe('Resource limits for the sandbox');

export const SandboxUserInfoSchema = z
	.object({
		id: z.string().describe('User ID'),
		firstName: z.string().optional().describe("User's first name"),
		lastName: z.string().optional().describe("User's last name"),
	})
	.describe('User who created the sandbox');

export const SandboxAgentInfoSchema = z
	.object({
		id: z.string().describe('Agent ID'),
		name: z.string().describe('Agent name'),
	})
	.describe('Agent associated with the sandbox');

export const SandboxProjectInfoSchema = z
	.object({
		id: z.string().describe('Project ID'),
		name: z.string().describe('Project name'),
	})
	.describe('Project associated with the sandbox');

export const SandboxOrgInfoSchema = z
	.object({
		id: z.string().describe('Organization ID'),
		name: z.string().describe('Organization name'),
	})
	.describe('Organization associated with the sandbox');

export const SandboxRuntimeInfoSchema = z
	.object({
		id: z.string().describe('Runtime ID'),
		name: z.string().describe('Runtime name (e.g., "bun:1")'),
		iconUrl: z.string().optional().describe('URL for runtime icon'),
		brandColor: z.string().optional().describe('Brand color for the runtime (hex color code)'),
		tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
	})
	.describe('Runtime information');

export const SandboxSnapshotUserInfoSchema = z
	.object({
		id: z.string().describe('User ID'),
		firstName: z.string().optional().describe("User's first name"),
		lastName: z.string().optional().describe("User's last name"),
	})
	.describe('Snapshot user information');

export const SandboxSnapshotOrgInfoSchema = z
	.object({
		id: z.string().describe('Organization ID'),
		name: z.string().describe('Organization name'),
		slug: z.string().optional().describe('Organization slug'),
	})
	.describe('Snapshot organization information');

export const SandboxSnapshotInfoSchema = z
	.union([
		z
			.object({
				id: z.string().describe('Snapshot ID'),
				name: z.string().optional().describe('Snapshot name'),
				tag: z.string().optional().describe('Snapshot tag'),
				fullName: z.string().optional().describe('Full name with org slug (@slug/name:tag)'),
				public: z.literal(true).describe('Public snapshot'),
				org: SandboxSnapshotOrgInfoSchema.describe(
					'Organization that owns the public snapshot'
				),
			})
			.describe('Public snapshot'),
		z
			.object({
				id: z.string().describe('Snapshot ID'),
				name: z.string().optional().describe('Snapshot name'),
				tag: z.string().optional().describe('Snapshot tag'),
				fullName: z.string().optional().describe('Full name with org slug (@slug/name:tag)'),
				public: z.literal(false).describe('Private snapshot'),
				user: SandboxSnapshotUserInfoSchema.describe('User who created the private snapshot'),
			})
			.describe('Private snapshot'),
	])
	.describe('Snapshot information (discriminated union)');

export const SandboxInfoDataSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the sandbox'),
		identifier: z.string().optional().describe('Short identifier for DNS hostname'),
		name: z.string().optional().describe('Sandbox name'),
		description: z.string().optional().describe('Sandbox description'),
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
				'deleted',
			])
			.describe('Current status of the sandbox'),
		mode: z.string().optional().describe('Sandbox mode (interactive or oneshot)'),
		createdAt: z.string().describe('ISO timestamp when the sandbox was created'),
		region: z.string().optional().describe('Region where the sandbox is running'),
		runtime: SandboxRuntimeInfoSchema.optional().describe('Runtime information'),
		snapshot: SandboxSnapshotInfoSchema.optional().describe('Snapshot information'),
		executions: z.number().describe('Total number of executions in this sandbox'),
		exitCode: z
			.number()
			.optional()
			.describe('Exit code from the last execution (only for terminated/failed sandboxes)'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
		auditStreamId: z.string().optional().describe('ID of the audit event stream'),
		auditStreamUrl: z.string().optional().describe('URL for streaming audit events'),
		dependencies: z
			.array(z.string())
			.optional()
			.describe('Apt packages installed in the sandbox'),
		packages: z
			.array(z.string())
			.optional()
			.describe('npm/bun packages installed globally in the sandbox'),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('User-defined metadata associated with the sandbox'),
		resources: SandboxResourcesSchema.optional().describe('Resource limits for this sandbox'),
		cpuTimeMs: z.number().optional().describe('Total CPU time consumed in milliseconds'),
		memoryByteSec: z.number().optional().describe('Total memory usage in byte-seconds'),
		networkEgressBytes: z.number().optional().describe('Total network egress in bytes'),
		networkEnabled: z.boolean().optional().describe('Whether network access is enabled'),
		networkPort: z.number().optional().describe('Network port exposed from the sandbox'),
		url: z
			.string()
			.optional()
			.describe('Public URL for the sandbox (only set if networkPort is configured)'),
		user: SandboxUserInfoSchema.optional().describe('User who created the sandbox'),
		agent: SandboxAgentInfoSchema.optional().describe('Agent associated with the sandbox'),
		project: SandboxProjectInfoSchema.optional().describe('Project associated with the sandbox'),
		org: SandboxOrgInfoSchema.nullish().describe('Organization associated with the sandbox'),
		timeout: z
			.object({
				idle: z.string().optional().describe('Idle timeout duration (e.g., "5m", "1h").'),
				execution: z
					.string()
					.optional()
					.describe('Execution timeout duration (e.g., "30m", "2h").'),
			})
			.optional()
			.describe('Timeout configuration for the sandbox.'),
		command: z
			.object({
				exec: z.array(z.string()).describe('Command and arguments to execute.'),
				mode: z
					.enum(['oneshot', 'interactive'])
					.optional()
					.describe('Execution mode for the command.'),
			})
			.optional()
			.describe('Command configuration for the sandbox.'),
	})
	.describe('Detailed information about a sandbox');

export const SandboxGetResponseSchema = APIResponseSchema(SandboxInfoDataSchema);

export const SandboxGetParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to fetch'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	includeDeleted: z
		.boolean()
		.optional()
		.describe('Whether deleted sandboxes should be included in lookup'),
	waitForStatus: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.describe('Optional desired status or statuses to wait for before responding'),
	waitMs: z
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe('Maximum time in milliseconds to wait for the desired status'),
});

export type SandboxGetParams = z.infer<typeof SandboxGetParamsSchema>;

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
	const { sandboxId, orgId, includeDeleted, waitForStatus, waitMs } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	if (includeDeleted) {
		queryParams.set('includeDeleted', 'true');
	}
	if (waitForStatus) {
		queryParams.set(
			'waitForStatus',
			Array.isArray(waitForStatus) ? waitForStatus.join(',') : waitForStatus
		);
	}
	if (waitMs != null) {
		queryParams.set('waitMs', String(waitMs));
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${encodeURIComponent(sandboxId)}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof SandboxGetResponseSchema>>(
		url,
		SandboxGetResponseSchema
	);

	if (resp.success) {
		// Newly created sandboxes can be served from the server's pending cache before
		// the backing row and related org hydration are fully available. That response
		// serializes `org: null`, so normalize it to a placeholder object instead of
		// failing response validation for an otherwise valid sandbox status poll.
		const org = resp.data.org ?? { id: orgId ?? '', name: '' };

		return {
			sandboxId: resp.data.sandboxId,
			identifier: resp.data.identifier,
			name: resp.data.name,
			description: resp.data.description,
			status: resp.data.status as SandboxStatus,
			mode: resp.data.mode,
			createdAt: resp.data.createdAt,
			region: resp.data.region,
			runtime: resp.data.runtime as SandboxRuntimeInfo | undefined,
			snapshot: resp.data.snapshot as SandboxSnapshotInfo | undefined,
			executions: resp.data.executions,
			exitCode: resp.data.exitCode,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
			auditStreamId: resp.data.auditStreamId,
			auditStreamUrl: resp.data.auditStreamUrl,
			dependencies: resp.data.dependencies,
			packages: resp.data.packages,
			metadata: resp.data.metadata as Record<string, unknown> | undefined,
			resources: resp.data.resources,
			cpuTimeMs: resp.data.cpuTimeMs,
			memoryByteSec: resp.data.memoryByteSec,
			networkEgressBytes: resp.data.networkEgressBytes,
			networkEnabled: resp.data.networkEnabled,
			networkPort: resp.data.networkPort,
			url: resp.data.url,
			user: resp.data.user,
			agent: resp.data.agent,
			project: resp.data.project,
			org,
			timeout: resp.data.timeout,
			command: resp.data.command,
		};
	}

	throwSandboxError(resp, { sandboxId });
}
