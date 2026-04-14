import { z } from 'zod/v4';
import {
	CoderCreateCustomAgentRequestSchema,
	CoderCreateSessionRequestSchema,
	CoderCustomAgentListResponseSchema,
	CoderCustomAgentVersionListResponseSchema,
	CoderListUsersResponseSchema,
	CoderLoopStateResponseSchema,
	CoderSessionEventSchema,
	CoderSessionListItemSchema,
	CoderSessionParticipantsSchema,
	CoderSessionSchema,
	CoderUpdateCustomAgentRequestSchema,
	CoderUpdateSessionRequestSchema,
} from './types.ts';
import { CoderCreateSessionParamsSchema, CoderLifecycleResponseSchema } from './sessions.ts';
import type { Service } from '../api-reference.ts';

// Docs-only wire schemas: the REST reference documents raw hub payloads,
// while the public Coder client continues to use the schemas from ./types.ts.
const CoderHubSessionListWireSchema = z.object({
	sessions: z
		.object({
			websocket: z
				.array(CoderSessionListItemSchema)
				.describe('Websocket-backed sessions returned by the hub'),
			sandbox: z
				.array(z.unknown())
				.describe('Non-websocket session entries returned by the hub'),
		})
		.describe('Sessions grouped by transport'),
	total: z.number().describe('Total sessions matching the query'),
});

const CoderSessionReplayWireSchema = z.object({
	sessionId: z.string().describe('Session identifier for replay payload'),
	entriesSource: z
		.enum(['durable_stream', 'session_entries', 'event_history', 'none'])
		.describe('Source used to reconstruct replay entries'),
	sourceCounts: z
		.object({
			durableStream: z.number().describe('Replay entries loaded from durable stream storage'),
			sessionEntries: z.number().describe('Replay entries loaded from session entry storage'),
			eventHistory: z.number().describe('Replay entries synthesized from event history'),
		})
		.optional()
		.describe('Counts of replay entries by source'),
	entries: z.array(z.unknown()).describe('Replay conversation entries for the session'),
});

const CoderSessionEventHistoryWireSchema = z.object({
	sessionId: z.string().describe('Session identifier for event history payload'),
	events: z.array(CoderSessionEventSchema).describe('Event history items for the session'),
});

const CoderCreateSessionResponseWireSchema = z
	.object({
		sessionId: z.string().describe('Created session identifier'),
		sandboxId: z.string().nullable().optional().describe('Associated sandbox identifier'),
		status: z.string().describe('Initial session status'),
		mode: z.string().optional().describe('Session mode'),
		visibility: z.string().optional().describe('Session visibility'),
	})
	.passthrough();

const CoderUpdateSessionRequestWireSchema = CoderUpdateSessionRequestSchema.pick({
	label: true,
	agent: true,
	defaultAgent: true,
	enabledAgents: true,
	visibility: true,
	tags: true,
	skills: true,
	metadata: true,
})
	.extend({
		savedSkillIds: z.array(z.string()).optional().describe('Updated saved skill ids'),
		skillBucketIds: z.array(z.string()).optional().describe('Updated skill bucket ids'),
	})
	.describe('Request body for updating public session metadata over REST');

const CoderUpdateSessionResponseWireSchema = z
	.object({
		sessionId: z.string().describe('Updated session identifier'),
		label: z.string().optional().describe('Updated label'),
		visibility: z.string().optional().describe('Updated visibility'),
		tags: z.array(z.string()).optional().describe('Updated tags'),
		skills: z.array(z.unknown()).optional().describe('Updated skills'),
		defaultAgent: z.string().nullable().optional().describe('Updated default agent'),
		enabledAgents: z.array(z.string()).optional().describe('Updated enabled agents'),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('Updated arbitrary metadata associated with the session'),
	})
	.passthrough();

const service: Service = {
	name: 'Coder',
	slug: 'coder',
	description:
		'Manage Coder sessions, custom agents, session data, loop state, and known users through the REST API',
	hasPublicEndpoints: false,
	endpoints: [
		{
			id: 'discover-coder-url',
			title: 'Discover Coder URL',
			sectionTitle: 'Discovery',
			method: 'GET',
			path: '/coder',
			description: 'Discovers the org-specific Coder base URL.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the discovered Coder URL.',
			statuses: [
				{ code: 200, description: 'Coder URL discovered' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/coder',
		},
		{
			id: 'create-session',
			title: 'Create Session',
			sectionTitle: 'Sessions',
			method: 'POST',
			path: '/hub/session',
			description: 'Creates a new coder session.',
			pathParams: [],
			queryParams: CoderCreateSessionParamsSchema.shape.orgId
				? [{ name: 'orgId', type: 'string', description: 'Organization ID', required: false }]
				: [],
			requestBody: {
				description: 'Session creation payload.',
				fields: { schema: CoderCreateSessionRequestSchema },
			},
			responseDescription: 'Returns the created session.',
			responseFields: { schema: CoderCreateSessionResponseWireSchema, stripRequired: true },
			statuses: [
				{ code: 201, description: 'Session created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/session',
			exampleBody: { task: 'Implement feature X', workflowMode: 'standard' },
		},
		{
			id: 'list-sessions',
			title: 'List Sessions',
			sectionTitle: 'Sessions',
			method: 'GET',
			path: '/hub/sessions',
			description: 'Lists sessions with optional filters and pagination.',
			pathParams: [],
			queryParams: [
				{ name: 'search', type: 'string', description: 'Search query', required: false },
				{
					name: 'includeArchived',
					type: 'boolean',
					description: 'Include archived sessions',
					required: false,
				},
				{ name: 'limit', type: 'number', description: 'Maximum results', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns a session list.',
			responseFields: { schema: CoderHubSessionListWireSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Sessions returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/sessions?limit=20&offset=0',
		},
		{
			id: 'get-session',
			title: 'Get Session',
			sectionTitle: 'Sessions',
			method: 'GET',
			path: '/hub/session/{sessionId}',
			description: 'Retrieve a single coder session by ID.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the full session object.',
			responseFields: { schema: CoderSessionSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Session returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123',
		},
		{
			id: 'update-session',
			title: 'Update Session',
			sectionTitle: 'Sessions',
			method: 'PATCH',
			path: '/hub/session/{sessionId}',
			description: 'Update an existing session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Session update payload.',
				fields: { schema: CoderUpdateSessionRequestWireSchema },
			},
			responseDescription: 'Returns the updated session fields.',
			responseFields: { schema: CoderUpdateSessionResponseWireSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Session updated' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123',
			exampleBody: { label: 'Updated Session', tags: ['auth', 'phase-2'] },
		},
		{
			id: 'archive-session',
			title: 'Archive Session',
			sectionTitle: 'Sessions',
			method: 'POST',
			path: '/hub/session/{sessionId}/archive',
			description: 'Archives an existing session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the session identifier and optional updated status.',
			responseFields: { schema: CoderLifecycleResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Lifecycle action applied' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/archive',
		},
		{
			id: 'resume-session',
			title: 'Resume Session',
			sectionTitle: 'Sessions',
			method: 'POST',
			path: '/hub/session/{sessionId}/resume',
			description: 'Resumes a paused session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the session identifier and optional updated status.',
			responseFields: { schema: CoderLifecycleResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Session resume initiated' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/resume',
		},
		{
			id: 'delete-session',
			title: 'Delete Session',
			sectionTitle: 'Sessions',
			method: 'DELETE',
			path: '/hub/session/{sessionId}',
			description: 'Permanently deletes a session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the deleted session identifier and status.',
			responseFields: { schema: CoderLifecycleResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Session deleted' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123',
		},
		{
			id: 'get-loop-state',
			title: 'Get Loop State',
			sectionTitle: 'Loop',
			method: 'GET',
			path: '/hub/session/{sessionId}/loop',
			description: 'Returns loop workflow state for a session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns loop state payload including iteration and status.',
			responseFields: { schema: CoderLoopStateResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Loop state returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/loop',
		},
		{
			id: 'list-users',
			title: 'List Users',
			sectionTitle: 'Users',
			method: 'GET',
			path: '/hub/users',
			description: 'Lists known coder users with optional search.',
			pathParams: [],
			queryParams: [
				{ name: 'search', type: 'string', description: 'Search query', required: false },
				{ name: 'limit', type: 'number', description: 'Maximum results', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns known users.',
			responseFields: { schema: CoderListUsersResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Users returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/users?search=jane',
		},
		{
			id: 'get-session-replay',
			title: 'Get Session Replay',
			sectionTitle: 'Session Data',
			method: 'GET',
			path: '/hub/session/{sessionId}/replay',
			description: 'Retrieve replay data for a session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns replay data for the session.',
			responseFields: { schema: CoderSessionReplayWireSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Replay returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/replay',
		},
		{
			id: 'list-session-participants',
			title: 'List Session Participants',
			sectionTitle: 'Session Data',
			method: 'GET',
			path: '/hub/session/{sessionId}/participants',
			description: 'Retrieve participants for a session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'limit', type: 'number', description: 'Maximum records', required: false },
				{
					name: 'includeDisconnected',
					type: 'boolean',
					description: 'Include disconnected participants',
					required: false,
				},
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns participants for the session.',
			responseFields: { schema: CoderSessionParticipantsSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Participants returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/participants?limit=200&includeDisconnected=true',
		},
		{
			id: 'list-session-event-history',
			title: 'List Session Event History',
			sectionTitle: 'Session Data',
			method: 'GET',
			path: '/hub/session/{sessionId}/events/history',
			description: 'Retrieve historical events for a session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'limit', type: 'number', description: 'Maximum records', required: false },
				{
					name: 'beforeId',
					type: 'number',
					description: 'Return events before the given event identifier',
					required: false,
				},
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns session event history.',
			responseFields: { schema: CoderSessionEventHistoryWireSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Event history returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/events/history?limit=50&beforeId=1234',
		},
		{
			id: 'list-custom-agents',
			title: 'List Custom Agents',
			sectionTitle: 'Agents',
			method: 'GET',
			path: '/hub/agents',
			description: 'Lists custom agents visible to the caller.',
			pathParams: [],
			queryParams: [
				{
					name: 'includeArchived',
					type: 'boolean',
					description: 'Include archived custom agents',
					required: false,
				},
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns custom agents visible to the caller.',
			responseFields: { schema: CoderCustomAgentListResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Custom agents returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/agents?includeArchived=true',
		},
		{
			id: 'create-custom-agent',
			title: 'Create Custom Agent',
			sectionTitle: 'Agents',
			method: 'POST',
			path: '/hub/agents',
			description: 'Creates a new custom-agent draft.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Custom-agent creation payload.',
				fields: { schema: CoderCreateCustomAgentRequestSchema },
			},
			responseDescription: 'Returns the created custom agent.',
			statuses: [
				{ code: 201, description: 'Custom agent created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/agents',
			exampleBody: {
				slug: 'code-review',
				displayName: 'Code Review',
				instructions: 'Focus on correctness, regressions, and missing tests.',
				tools: ['read', 'grep', 'ls'],
				serviceTools: ['session_todo_list', 'session_todo_update'],
			},
		},
		{
			id: 'get-custom-agent',
			title: 'Get Custom Agent',
			sectionTitle: 'Agents',
			method: 'GET',
			path: '/hub/agents/{agentIdOrSlug}',
			description: 'Fetches a custom agent by id or slug.',
			pathParams: [
				{
					name: 'agentIdOrSlug',
					type: 'string',
					description: 'Custom agent id or slug',
					required: true,
				},
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the requested custom agent.',
			statuses: [
				{ code: 200, description: 'Custom agent returned' },
				{ code: 404, description: 'Custom agent not found' },
			],
			examplePath: '/hub/agents/code-review',
		},
		{
			id: 'update-custom-agent',
			title: 'Update Custom Agent',
			sectionTitle: 'Agents',
			method: 'PATCH',
			path: '/hub/agents/{agentIdOrSlug}',
			description: 'Updates an owned custom-agent draft.',
			pathParams: [
				{
					name: 'agentIdOrSlug',
					type: 'string',
					description: 'Custom agent id or slug',
					required: true,
				},
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Custom-agent update payload.',
				fields: { schema: CoderUpdateCustomAgentRequestSchema },
			},
			responseDescription: 'Returns the updated custom agent.',
			statuses: [
				{ code: 200, description: 'Custom agent updated' },
				{ code: 404, description: 'Custom agent not found' },
			],
			examplePath: '/hub/agents/code-review',
			exampleBody: { displayName: 'Code Review Draft' },
		},
		{
			id: 'publish-custom-agent',
			title: 'Publish Custom Agent',
			sectionTitle: 'Agents',
			method: 'POST',
			path: '/hub/agents/{agentIdOrSlug}/publish',
			description: 'Publishes an owned custom agent.',
			pathParams: [
				{
					name: 'agentIdOrSlug',
					type: 'string',
					description: 'Custom agent id or slug',
					required: true,
				},
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the updated custom agent.',
			statuses: [
				{ code: 200, description: 'Custom agent published' },
				{ code: 404, description: 'Custom agent not found' },
			],
			examplePath: '/hub/agents/code-review/publish',
		},
		{
			id: 'archive-custom-agent',
			title: 'Archive Custom Agent',
			sectionTitle: 'Agents',
			method: 'POST',
			path: '/hub/agents/{agentIdOrSlug}/archive',
			description: 'Archives an owned custom agent.',
			pathParams: [
				{
					name: 'agentIdOrSlug',
					type: 'string',
					description: 'Custom agent id or slug',
					required: true,
				},
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the updated custom agent.',
			statuses: [
				{ code: 200, description: 'Custom agent archived' },
				{ code: 404, description: 'Custom agent not found' },
			],
			examplePath: '/hub/agents/code-review/archive',
		},
		{
			id: 'list-custom-agent-versions',
			title: 'List Custom Agent Versions',
			sectionTitle: 'Agents',
			method: 'GET',
			path: '/hub/agents/{agentIdOrSlug}/versions',
			description: 'Lists immutable published versions for a custom agent.',
			pathParams: [
				{
					name: 'agentIdOrSlug',
					type: 'string',
					description: 'Custom agent id or slug',
					required: true,
				},
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns published versions for the custom agent.',
			responseFields: {
				schema: CoderCustomAgentVersionListResponseSchema,
				stripRequired: true,
			},
			statuses: [
				{ code: 200, description: 'Custom agent versions returned' },
				{ code: 404, description: 'Custom agent not found' },
			],
			examplePath: '/hub/agents/code-review/versions',
		},
	],
};

export default service;
