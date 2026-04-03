import { z } from 'zod/v4';
import { type APIClient } from '../api.ts';
import {
	CoderCreateSessionRequestSchema,
	CoderListSessionsParamsSchema,
	CoderSessionListResponseSchema,
	CoderSessionListItemSchema,
	CoderSessionSchema,
	CoderUpdateSessionRequestSchema,
	type CoderCreateSessionRequest,
	type CoderListSessionsParams,
	type CoderSession,
	type CoderSessionListResponse,
	type CoderUpdateSessionRequest,
} from './types.ts';

const CoderHubSessionListResponseSchema = z.object({
	sessions: z.object({
		websocket: z.array(CoderSessionListItemSchema),
		sandbox: z.array(z.unknown()),
	}),
	total: z.number(),
});

const CoderLifecycleResponseSchema = z
	.object({
		sessionId: z.string().describe('Session identifier'),
		status: z.string().optional().describe('New session status'),
	})
	.passthrough();

export const CoderSessionIdParamsSchema = z
	.object({
		sessionId: z.string().describe('Coder session identifier'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Common parameters for single-session operations');
export type CoderSessionIdParams = z.infer<typeof CoderSessionIdParamsSchema>;

export const CoderCreateSessionParamsSchema = z
	.object({
		body: CoderCreateSessionRequestSchema.describe('Create-session request body'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Parameters for creating a coder session');
export type CoderCreateSessionParams = z.infer<typeof CoderCreateSessionParamsSchema>;

export const CoderGetSessionParamsSchema = CoderSessionIdParamsSchema.describe(
	'Parameters for retrieving a coder session'
);
export type CoderGetSessionParams = z.infer<typeof CoderGetSessionParamsSchema>;

export const CoderUpdateSessionParamsSchema = z
	.object({
		sessionId: z.string().describe('Coder session identifier to update'),
		body: CoderUpdateSessionRequestSchema.describe('Update-session request body'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Parameters for updating a coder session');
export type CoderUpdateSessionParams = z.infer<typeof CoderUpdateSessionParamsSchema>;

export const CoderListSessionsParamsWithOrgSchema = CoderListSessionsParamsSchema.describe(
	'Parameters for listing coder sessions'
);
export type CoderListSessionsParamsWithOrg = z.infer<typeof CoderListSessionsParamsWithOrgSchema>;

export const CoderListConnectableSessionsParamsSchema = z
	.object({
		search: z.string().optional().describe('Search query for connectable sessions'),
		limit: z.number().int().optional().describe('Maximum number of sessions to return'),
		offset: z.number().int().optional().describe('Number of sessions to skip for pagination'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Parameters for listing connectable coder sessions');
export type CoderListConnectableSessionsParams = z.infer<
	typeof CoderListConnectableSessionsParamsSchema
>;

function normalizeSessionList(
	payload:
		| z.infer<typeof CoderSessionListResponseSchema>
		| z.infer<typeof CoderSessionListItemSchema>[]
): CoderSessionListResponse {
	if (Array.isArray(payload)) {
		return {
			sessions: payload,
			total: payload.length,
		};
	}

	return CoderSessionListResponseSchema.parse(payload);
}

function buildListQuery(
	params?: CoderListSessionsParams | CoderListConnectableSessionsParams
): string {
	const query = new URLSearchParams();
	if (params?.search) {
		query.set('search', params.search);
	}
	if (params && 'includeArchived' in params && params.includeArchived !== undefined) {
		query.set('includeArchived', String(params.includeArchived));
	}
	if (params?.limit !== undefined) {
		query.set('limit', String(params.limit));
	}
	if (params?.offset !== undefined) {
		query.set('offset', String(params.offset));
	}
	const queryString = query.toString();
	return queryString ? `?${queryString}` : '';
}

const CoderCreateSessionResponseSchema = z
	.object({
		sessionId: z.string().describe('Created session identifier'),
		sandboxId: z.string().nullable().optional().describe('Associated sandbox identifier'),
		status: z.string().describe('Initial session status'),
		mode: z.string().optional().describe('Session mode'),
		visibility: z.string().optional().describe('Session visibility'),
	})
	.passthrough();

export interface CoderCreateSessionResponse {
	sessionId: string;
	sandboxId?: string | null;
	status: string;
	mode?: string;
	visibility?: string;
}

export async function coderCreateSession(
	client: APIClient,
	params: CoderCreateSessionParams
): Promise<CoderCreateSessionResponse> {
	return client.post<CoderCreateSessionResponse, CoderCreateSessionRequest>(
		'/hub/session',
		params.body,
		CoderCreateSessionResponseSchema,
		CoderCreateSessionRequestSchema
	);
}

export async function coderGetSession(
	client: APIClient,
	params: CoderGetSessionParams
): Promise<CoderSession> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}`;
	return client.get<CoderSession>(path, CoderSessionSchema);
}

const CoderUpdateSessionResponseSchema = z
	.object({
		sessionId: z.string().describe('Updated session identifier'),
		label: z.string().optional().describe('Updated label'),
		visibility: z.string().optional().describe('Updated visibility'),
		tags: z.array(z.string()).optional().describe('Updated tags'),
		skills: z.array(z.unknown()).optional().describe('Updated skills'),
		defaultAgent: z.string().nullable().optional().describe('Updated default agent'),
	})
	.passthrough();

export interface CoderUpdateSessionResponse {
	sessionId: string;
	label?: string;
	visibility?: string;
	tags?: string[];
	skills?: unknown[];
	defaultAgent?: string | null;
}

export async function coderUpdateSession(
	client: APIClient,
	params: CoderUpdateSessionParams
): Promise<CoderUpdateSessionResponse> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}`;

	return client.patch<CoderUpdateSessionResponse, CoderUpdateSessionRequest>(
		path,
		params.body,
		CoderUpdateSessionResponseSchema,
		CoderUpdateSessionRequestSchema
	);
}

export async function coderListSessions(
	client: APIClient,
	params?: CoderListSessionsParamsWithOrg
): Promise<CoderSessionListResponse> {
	const path = `/hub/sessions${buildListQuery(params)}`;
	const raw = await client.get<z.infer<typeof CoderHubSessionListResponseSchema>>(
		path,
		CoderHubSessionListResponseSchema
	);

	return normalizeSessionList({
		sessions: raw.sessions.websocket,
		total: raw.total,
	});
}

export async function coderDeleteSession(
	client: APIClient,
	params: CoderSessionIdParams
): Promise<void> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}`;
	await client.delete(path);
}

export interface CoderLifecycleResponse {
	sessionId: string;
	status?: string;
}

export async function coderArchiveSession(
	client: APIClient,
	params: CoderSessionIdParams
): Promise<CoderLifecycleResponse> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}/archive`;
	return client.post<CoderLifecycleResponse>(path, undefined, CoderLifecycleResponseSchema);
}

export async function coderListConnectableSessions(
	client: APIClient,
	params?: CoderListConnectableSessionsParams
): Promise<CoderSessionListResponse> {
	const path = `/hub/sessions/connectable${buildListQuery(params)}`;
	const raw = await client.get<z.infer<typeof CoderHubSessionListResponseSchema>>(
		path,
		CoderHubSessionListResponseSchema
	);

	return normalizeSessionList({
		sessions: raw.sessions.websocket,
		total: raw.total,
	});
}
