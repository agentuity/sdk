import type { Service } from '../api-reference.ts';
import { EnrichedSessionDataSchema } from './get.ts';
import { SessionSchema } from './list.ts';
import { LogSchema } from './logs.ts';

const service: Service = {
	name: 'Sessions',
	slug: 'sessions',
	description: 'View agent execution sessions with timing, cost, and observability data',
	endpoints: [
		{
			id: 'list-sessions',
			title: 'List Sessions',
			method: 'GET',
			path: '/session',
			description: 'List sessions with optional filtering, sorting, and pagination.',
			pathParams: [],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Max results, default 10',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{
					name: 'sort',
					type: 'string',
					description: '\\`created\\`, \\`updated\\`, \\`duration\\`, or \\`startTime\\`',
					required: false,
				},
				{
					name: 'direction',
					type: 'string',
					description: '\\`asc\\` or \\`desc\\`',
					required: false,
				},
				{
					name: 'orgId',
					type: 'string',
					description: 'Filter by organization ID',
					required: false,
				},
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project ID',
					required: false,
				},
				{
					name: 'deploymentId',
					type: 'string',
					description: 'Filter by deployment ID',
					required: false,
				},
				{
					name: 'trigger',
					type: 'string',
					description:
						'\\`agent\\`, \\`api\\`, \\`email\\`, \\`sms\\`, \\`cron\\`, \\`manual\\`, \\`discord\\`, or \\`websocket\\`',
					required: false,
				},
				{ name: 'env', type: 'string', description: 'Filter by environment', required: false },
				{
					name: 'devmode',
					type: 'boolean',
					description: 'Filter by devmode status',
					required: false,
				},
				{
					name: 'success',
					type: 'boolean',
					description: 'Filter by success status',
					required: false,
				},
				{
					name: 'threadId',
					type: 'string',
					description: 'Filter by thread ID',
					required: false,
				},
				{
					name: 'agentIdentifier',
					type: 'string',
					description: 'Filter by agent identifier',
					required: false,
				},
				{
					name: 'startAfter',
					type: 'string',
					description: 'ISO 8601 start-after filter',
					required: false,
				},
				{
					name: 'startBefore',
					type: 'string',
					description: 'ISO 8601 start-before filter',
					required: false,
				},
				{
					name: 'metadata',
					type: 'string',
					description: 'JSON-serialized filter',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns sessions matching the specified filters.',
			responseFields: { schema: SessionSchema },
			statuses: [
				{ code: 200, description: 'Sessions returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/session',
		},
		{
			id: 'get-session',
			title: 'Get Session',
			method: 'GET',
			path: '/session/{id}',
			description:
				'Retrieve a specific session with enriched data including agent info, eval runs, and route details.',
			pathParams: [{ name: 'id', type: 'string', description: 'Session ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Returns the session with enriched data including agent info, eval runs, and route details.',
			responseFields: { schema: EnrichedSessionDataSchema },
			statuses: [
				{ code: 200, description: 'Session returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/session/ses_abc123',
		},
		{
			id: 'get-session-logs',
			title: 'Get Session Logs',
			sectionTitle: 'Logs',
			method: 'GET',
			path: '/cli/session/{id}/logs',
			description: 'Retrieve log entries for a specific session.',
			pathParams: [{ name: 'id', type: 'string', description: 'Session ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns log entries for the session.',
			responseFields: { schema: LogSchema },
			statuses: [
				{ code: 200, description: 'Logs returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Session not found' },
			],
			examplePath: '/cli/session/ses_abc123/logs',
			ttlNote:
				'This endpoint uses the App API base URL (`api.agentuity.com`), not the regional Catalyst URL.',
		},
	],
};

export default service;
