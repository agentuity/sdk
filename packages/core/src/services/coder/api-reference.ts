import { z } from 'zod/v4';
import {
	CoderCreateSessionRequestSchema,
	CoderListUsersResponseSchema,
	CoderLoopStateResponseSchema,
	CoderSessionEventSchema,
	CoderSessionListItemSchema,
	CoderSessionParticipantsSchema,
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

const service: Service = {
	name: 'Coder',
	slug: 'coder',
	description:
		'Manage Coder sessions, session data, loop state, and known users through the HTTP API',
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
			statuses: [
				{ code: 200, description: 'Session created' },
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
			id: 'session-lifecycle',
			title: 'Session Lifecycle Endpoints',
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
				{ name: 'limit', type: 'number', description: 'Maximum records', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
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
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns participants for the session.',
			responseFields: { schema: CoderSessionParticipantsSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Participants returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/participants',
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
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns session event history.',
			responseFields: { schema: CoderSessionEventHistoryWireSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Event history returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/events/history?limit=50&offset=0',
		},
	],
};

export default service;
