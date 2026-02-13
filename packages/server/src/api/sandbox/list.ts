import type {
	ListSandboxesParams,
	ListSandboxesResponse,
	SandboxRuntimeInfo,
	SandboxSnapshotInfo,
	SandboxStatus,
} from '@agentuity/core';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api';
import { API_VERSION, throwSandboxError } from './util';

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

export const SandboxInfoSchema = z
	.object({
		sandboxId: z.string().describe('Unique identifier for the sandbox'),
		identifier: z.string().optional().describe('Short identifier for DNS hostname'),
		name: z.string().optional().describe('Sandbox name'),
		description: z.string().optional().describe('Sandbox description'),
		status: z
			.enum(['creating', 'idle', 'running', 'terminated', 'failed', 'deleted'])
			.describe('Current status of the sandbox'),
		mode: z.string().optional().describe('Sandbox mode (interactive or oneshot)'),
		createdAt: z.string().describe('ISO timestamp when the sandbox was created'),
		region: z.string().optional().describe('Region where the sandbox is running'),
		runtime: SandboxRuntimeInfoSchema.optional().describe('Runtime information'),
		snapshot: SandboxSnapshotInfoSchema.optional().describe('Snapshot information'),
		executions: z.number().describe('Total number of executions in this sandbox'),
		stdoutStreamUrl: z.string().optional().describe('URL for streaming stdout output'),
		stderrStreamUrl: z.string().optional().describe('URL for streaming stderr output'),
		networkEnabled: z.boolean().optional().describe('Whether network access is enabled'),
		networkPort: z.number().optional().describe('Network port exposed from the sandbox'),
		url: z
			.string()
			.optional()
			.describe('Public URL for the sandbox (only set if networkPort is configured)'),
		org: SandboxOrgInfoSchema.describe('Organization associated with the sandbox'),
		timeout: z
			.object({
				idle: z.string().optional(),
				execution: z.string().optional(),
			})
			.optional(),
		command: z
			.object({
				exec: z.array(z.string()),
				mode: z.enum(['oneshot', 'interactive']).optional(),
			})
			.optional(),
	})
	.describe('Summary information about a sandbox');

export const ListSandboxesDataSchema = z
	.object({
		sandboxes: z.array(SandboxInfoSchema).describe('List of sandbox entries'),
		total: z.number().describe('Total number of sandboxes matching the query'),
	})
	.describe('Paginated list of sandboxes');

export const ListSandboxesResponseSchema = APIResponseSchema(ListSandboxesDataSchema);

export interface SandboxListParams extends ListSandboxesParams {
	orgId?: string;
	deletedOnly?: boolean;
}

/**
 * Lists sandboxes with optional filtering and pagination.
 *
 * @param client - The API client to use for the request
 * @param params - Optional parameters for filtering by project, status, and pagination
 * @returns Paginated list of sandboxes with total count
 * @throws {SandboxResponseError} If the request fails
 */
export async function sandboxList(
	client: APIClient,
	params?: SandboxListParams
): Promise<ListSandboxesResponse> {
	const queryParams = new URLSearchParams();

	if (params?.orgId) {
		queryParams.set('orgId', params.orgId);
	}
	if (params?.name) {
		queryParams.set('name', params.name);
	}
	if (params?.mode) {
		queryParams.set('mode', params.mode);
	}
	if (params?.projectId) {
		queryParams.set('projectId', params.projectId);
	}
	if (params?.snapshotId) {
		queryParams.set('snapshotId', params.snapshotId);
	}
	if (params?.status) {
		queryParams.set('status', params.status);
	}
	if (params?.live !== undefined) {
		queryParams.set('live', params.live.toString());
	}
	if (params?.limit !== undefined) {
		queryParams.set('limit', params.limit.toString());
	}
	if (params?.offset !== undefined) {
		queryParams.set('offset', params.offset.toString());
	}
	if (params?.sort) {
		queryParams.set('sort', params.sort);
	}
	if (params?.direction) {
		queryParams.set('direction', params.direction);
	}
	if (params?.deletedOnly) {
		queryParams.set('deletedOnly', 'true');
	}

	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ListSandboxesResponseSchema>>(
		url,
		ListSandboxesResponseSchema
	);

	if (resp.success) {
		return {
			sandboxes: resp.data.sandboxes.map((s) => ({
				sandboxId: s.sandboxId,
				identifier: s.identifier,
				name: s.name,
				description: s.description,
				status: s.status as SandboxStatus,
				mode: s.mode,
				createdAt: s.createdAt,
				region: s.region,
				runtime: s.runtime as SandboxRuntimeInfo | undefined,
				snapshot: s.snapshot as SandboxSnapshotInfo | undefined,
				executions: s.executions,
				stdoutStreamUrl: s.stdoutStreamUrl,
				stderrStreamUrl: s.stderrStreamUrl,
				networkEnabled: s.networkEnabled,
				networkPort: s.networkPort,
				url: s.url,
				org: s.org,
			})),
			total: resp.data.total,
		};
	}

	throwSandboxError(resp, {});
}
