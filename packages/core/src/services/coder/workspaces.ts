import { z } from 'zod/v4';
import { type APIClient } from '../api.ts';
import {
	CoderCreateWorkspaceRequestSchema,
	CoderUpdateWorkspaceRequestSchema,
	CoderWorkspaceDependencyValidationResponseSchema,
	CoderWorkspaceDetailSchema,
	CoderWorkspaceListResponseSchema,
	type CoderCreateWorkspaceRequest,
	type CoderUpdateWorkspaceRequest,
	type CoderWorkspaceDependencyValidationResponse,
	type CoderWorkspaceDetail,
	type CoderWorkspaceListResponse,
} from './types.ts';

const WorkspaceGetResponseSchema = z
	.object({
		workspace: CoderWorkspaceDetailSchema.describe('Workspace payload returned by coder hub'),
	})
	.passthrough()
	.describe('Wrapped workspace response from coder hub');

const WorkspaceCreateResponseSchema = z
	.object({
		workspace: CoderWorkspaceDetailSchema.describe(
			'Created workspace payload returned by coder hub'
		),
	})
	.passthrough()
	.describe('Wrapped workspace create response from coder hub');

const WorkspaceUpdateResponseSchema = z
	.object({
		workspace: CoderWorkspaceDetailSchema.describe(
			'Updated workspace payload returned by coder hub'
		),
	})
	.passthrough()
	.describe('Wrapped workspace update response from coder hub');

const WorkspaceSnapshotRefreshResponseSchema = z
	.object({
		workspace: CoderWorkspaceDetailSchema.describe(
			'Workspace payload returned after refreshing its snapshot'
		),
	})
	.passthrough()
	.describe('Wrapped workspace snapshot refresh response from coder hub');

const WorkspaceDependencyValidationWrappedResponseSchema = z
	.object({
		success: z.boolean().describe('Validation request success indicator'),
		data: CoderWorkspaceDependencyValidationResponseSchema.describe(
			'Dependency validation result'
		),
	})
	.passthrough()
	.describe('Wrapped workspace dependency validation response from coder hub');

const OkResponseSchema = z
	.object({
		ok: z.boolean().describe('Operation success indicator'),
	})
	.passthrough()
	.describe('Generic ok response from coder hub');

export async function coderListWorkspaces(client: APIClient): Promise<CoderWorkspaceListResponse> {
	return client.get<CoderWorkspaceListResponse>(
		'/hub/workspaces',
		CoderWorkspaceListResponseSchema
	);
}

export async function coderGetWorkspace(
	client: APIClient,
	params: { workspaceId: string }
): Promise<CoderWorkspaceDetail> {
	const path = `/hub/workspaces/${encodeURIComponent(params.workspaceId)}`;
	const resp = await client.get<z.infer<typeof WorkspaceGetResponseSchema>>(
		path,
		WorkspaceGetResponseSchema
	);
	return resp.workspace;
}

export async function coderCreateWorkspace(
	client: APIClient,
	params: { body: CoderCreateWorkspaceRequest }
): Promise<CoderWorkspaceDetail> {
	const resp = await client.post<
		z.infer<typeof WorkspaceCreateResponseSchema>,
		CoderCreateWorkspaceRequest
	>(
		'/hub/workspaces',
		params.body,
		WorkspaceCreateResponseSchema,
		CoderCreateWorkspaceRequestSchema
	);

	return resp.workspace;
}

export async function coderUpdateWorkspace(
	client: APIClient,
	params: { workspaceId: string; body: CoderUpdateWorkspaceRequest }
): Promise<CoderWorkspaceDetail> {
	const path = `/hub/workspaces/${encodeURIComponent(params.workspaceId)}`;
	const resp = await client.patch<
		z.infer<typeof WorkspaceUpdateResponseSchema>,
		CoderUpdateWorkspaceRequest
	>(path, params.body, WorkspaceUpdateResponseSchema, CoderUpdateWorkspaceRequestSchema);

	return resp.workspace;
}

export async function coderRefreshWorkspaceSnapshot(
	client: APIClient,
	params: { workspaceId: string }
): Promise<CoderWorkspaceDetail> {
	const path = `/hub/workspaces/${encodeURIComponent(params.workspaceId)}/snapshot/refresh`;
	const resp = await client.post<z.infer<typeof WorkspaceSnapshotRefreshResponseSchema>>(
		path,
		undefined,
		WorkspaceSnapshotRefreshResponseSchema
	);

	return resp.workspace;
}

export async function coderValidateWorkspaceDependencies(
	client: APIClient,
	params: { dependencies: string[] }
): Promise<CoderWorkspaceDependencyValidationResponse> {
	const resp = await client.post<
		z.infer<typeof WorkspaceDependencyValidationWrappedResponseSchema>
	>(
		'/hub/workspaces/dependencies/validate',
		{ dependencies: params.dependencies },
		WorkspaceDependencyValidationWrappedResponseSchema
	);

	return resp.data;
}

export async function coderDeleteWorkspace(
	client: APIClient,
	params: { workspaceId: string }
): Promise<void> {
	const path = `/hub/workspaces/${encodeURIComponent(params.workspaceId)}`;
	await client.delete(path, OkResponseSchema);
}
