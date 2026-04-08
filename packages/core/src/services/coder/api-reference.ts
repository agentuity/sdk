import {
	CoderCreateCustomAgentRequestSchema,
	CoderCreateSessionRequestSchema,
	CoderLoopStateResponseSchema,
	CoderUpdateCustomAgentRequestSchema,
} from './types.ts';
import { CoderListCustomAgentsParamsSchema } from './agents.ts';
import {
	CoderCreateSessionParamsSchema,
	CoderListConnectableSessionsParamsSchema,
	CoderListSessionsParamsWithOrgSchema,
	CoderSessionIdParamsSchema,
} from './sessions.ts';
import { CoderSessionDataQuerySchema } from './types.ts';
import { CoderListUsersParamsWithOrgSchema } from './users.ts';
import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Coder',
	slug: 'coder',
	description:
		'Manage Coder sessions, custom agents, session data, loop state, and known users through the HTTP API',
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
			responseFields: { schema: CoderListSessionsParamsWithOrgSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Sessions returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/sessions?limit=20&offset=0',
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
			responseFields: { schema: CoderListUsersParamsWithOrgSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Users returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/users?search=jane',
		},
		{
			id: 'session-data',
			title: 'Session Data Endpoints',
			sectionTitle: 'Session Data',
			method: 'GET',
			path: '/hub/session/{sessionId}/(replay|participants|events/history)',
			description: 'Retrieve replay, participant list, or historical events for a session.',
			pathParams: [
				{ name: 'sessionId', type: 'string', description: 'Session ID', required: true },
			],
			queryParams: [
				{ name: 'limit', type: 'number', description: 'Maximum records', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the requested session data payload.',
			responseFields: { schema: CoderSessionDataQuerySchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Session data returned' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/replay',
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
			responseDescription: 'Returns success and optionally updated session payload.',
			responseFields: { schema: CoderSessionIdParamsSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Lifecycle action applied' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/hub/session/sess_123/archive',
		},
		{
			id: 'connectable-sessions',
			title: 'List Connectable Sessions',
			sectionTitle: 'Sessions',
			method: 'GET',
			path: '/hub/sessions/connectable',
			description: 'Lists sessions the authenticated user can connect to.',
			pathParams: [],
			queryParams: [
				{ name: 'search', type: 'string', description: 'Search query', required: false },
				{ name: 'limit', type: 'number', description: 'Maximum results', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns connectable sessions.',
			responseFields: { schema: CoderListConnectableSessionsParamsSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Connectable sessions returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/hub/sessions/connectable',
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
			responseFields: { schema: CoderListCustomAgentsParamsSchema, stripRequired: true },
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
				preset: 'reviewer',
				instructions: 'Focus on correctness, regressions, and missing tests.',
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
			id: 'custom-agent-lifecycle',
			title: 'Custom Agent Lifecycle Endpoints',
			sectionTitle: 'Agents',
			method: 'POST',
			path: '/hub/agents/{agentIdOrSlug}/(publish|archive)',
			description: 'Publishes or archives an owned custom agent.',
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
				{ code: 200, description: 'Lifecycle action applied' },
				{ code: 404, description: 'Custom agent not found' },
			],
			examplePath: '/hub/agents/code-review/publish',
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
			statuses: [
				{ code: 200, description: 'Custom agent versions returned' },
				{ code: 404, description: 'Custom agent not found' },
			],
			examplePath: '/hub/agents/code-review/versions',
		},
	],
};

export default service;
