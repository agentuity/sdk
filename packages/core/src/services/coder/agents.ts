import { z } from 'zod/v4';
import { type APIClient } from '../api.ts';
import {
	CoderCreateCustomAgentRequestSchema,
	CoderCustomAgentListResponseSchema,
	CoderCustomAgentSchema,
	CoderCustomAgentVersionListResponseSchema,
	CoderUpdateCustomAgentRequestSchema,
	type CoderCreateCustomAgentRequest,
	type CoderCustomAgent,
	type CoderCustomAgentListResponse,
	type CoderCustomAgentVersionListResponse,
	type CoderUpdateCustomAgentRequest,
} from './types.ts';

const CustomAgentResponseSchema = z
	.object({
		agent: CoderCustomAgentSchema.describe('Custom agent payload returned by coder hub'),
	})
	.passthrough()
	.describe('Wrapped custom agent response from coder hub');

export const CoderCustomAgentIdParamsSchema = z
	.object({
		agentIdOrSlug: z.string().describe('Custom agent id or slug'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Common parameters for single custom-agent operations');
export type CoderCustomAgentIdParams = z.infer<typeof CoderCustomAgentIdParamsSchema>;

export const CoderListCustomAgentsParamsSchema = z
	.object({
		includeArchived: z
			.boolean()
			.optional()
			.describe('Whether archived custom agents should be included'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Parameters for listing custom agents');
export type CoderListCustomAgentsParams = z.infer<typeof CoderListCustomAgentsParamsSchema>;

export const CoderCreateCustomAgentParamsSchema = z
	.object({
		body: CoderCreateCustomAgentRequestSchema.describe('Create-custom-agent request body'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Parameters for creating a custom agent');
export type CoderCreateCustomAgentParams = z.infer<typeof CoderCreateCustomAgentParamsSchema>;

export const CoderUpdateCustomAgentParamsSchema = z
	.object({
		agentIdOrSlug: z.string().describe('Custom agent id or slug to update'),
		body: CoderUpdateCustomAgentRequestSchema.describe('Update-custom-agent request body'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Parameters for updating a custom agent');
export type CoderUpdateCustomAgentParams = z.infer<typeof CoderUpdateCustomAgentParamsSchema>;

function buildAgentListQuery(params?: CoderListCustomAgentsParams): string {
	const query = new URLSearchParams();
	if (params?.includeArchived !== undefined) {
		query.set('includeArchived', String(params.includeArchived));
	}
	const queryString = query.toString();
	return queryString ? `?${queryString}` : '';
}

export async function coderListCustomAgents(
	client: APIClient,
	params?: CoderListCustomAgentsParams
): Promise<CoderCustomAgentListResponse> {
	const path = `/hub/agents${buildAgentListQuery(params)}`;
	return client.get<CoderCustomAgentListResponse>(path, CoderCustomAgentListResponseSchema);
}

export async function coderGetCustomAgent(
	client: APIClient,
	params: CoderCustomAgentIdParams
): Promise<CoderCustomAgent> {
	const path = `/hub/agents/${encodeURIComponent(params.agentIdOrSlug)}`;
	const resp = await client.get<z.infer<typeof CustomAgentResponseSchema>>(
		path,
		CustomAgentResponseSchema
	);
	return resp.agent;
}

export async function coderCreateCustomAgent(
	client: APIClient,
	params: CoderCreateCustomAgentParams
): Promise<CoderCustomAgent> {
	const resp = await client.post<
		z.infer<typeof CustomAgentResponseSchema>,
		CoderCreateCustomAgentRequest
	>('/hub/agents', params.body, CustomAgentResponseSchema, CoderCreateCustomAgentRequestSchema);

	return resp.agent;
}

export async function coderUpdateCustomAgent(
	client: APIClient,
	params: CoderUpdateCustomAgentParams
): Promise<CoderCustomAgent> {
	const path = `/hub/agents/${encodeURIComponent(params.agentIdOrSlug)}`;
	const resp = await client.patch<
		z.infer<typeof CustomAgentResponseSchema>,
		CoderUpdateCustomAgentRequest
	>(path, params.body, CustomAgentResponseSchema, CoderUpdateCustomAgentRequestSchema);

	return resp.agent;
}

export async function coderPublishCustomAgent(
	client: APIClient,
	params: CoderCustomAgentIdParams
): Promise<CoderCustomAgent> {
	const path = `/hub/agents/${encodeURIComponent(params.agentIdOrSlug)}/publish`;
	const resp = await client.post<z.infer<typeof CustomAgentResponseSchema>>(
		path,
		undefined,
		CustomAgentResponseSchema
	);
	return resp.agent;
}

export async function coderArchiveCustomAgent(
	client: APIClient,
	params: CoderCustomAgentIdParams
): Promise<CoderCustomAgent> {
	const path = `/hub/agents/${encodeURIComponent(params.agentIdOrSlug)}/archive`;
	const resp = await client.post<z.infer<typeof CustomAgentResponseSchema>>(
		path,
		undefined,
		CustomAgentResponseSchema
	);
	return resp.agent;
}

export async function coderListCustomAgentVersions(
	client: APIClient,
	params: CoderCustomAgentIdParams
): Promise<CoderCustomAgentVersionListResponse> {
	const path = `/hub/agents/${encodeURIComponent(params.agentIdOrSlug)}/versions`;
	return client.get<CoderCustomAgentVersionListResponse>(
		path,
		CoderCustomAgentVersionListResponseSchema
	);
}
