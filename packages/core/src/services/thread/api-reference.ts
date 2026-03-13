import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Threads',
	slug: 'threads',
	description: 'Manage conversation threads for agent session state and user data',
	endpoints: [
		{
			id: 'list-threads',
			title: 'List Threads',
			method: 'GET',
			path: '/thread',
			description: 'List conversation threads with optional filtering and pagination.',
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
					description: "'created' or 'updated'",
					required: false,
				},
				{ name: 'direction', type: 'string', description: "'asc' or 'desc'", required: false },
				{ name: 'orgId', type: 'string', description: 'Filter by org', required: false },
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project',
					required: false,
				},
				{
					name: 'metadata',
					type: 'string',
					description: 'JSON-serialized metadata filter',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Array of thread objects.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Thread ID' },
				{ name: 'created_at', type: 'string', description: 'Creation timestamp' },
				{ name: 'updated_at', type: 'string', description: 'Last update timestamp' },
				{ name: 'deleted', type: 'boolean', description: 'Whether the thread is deleted' },
				{ name: 'org_id', type: 'string', description: 'Organization ID' },
				{ name: 'project_id', type: 'string', description: 'Project ID' },
				{ name: 'user_data', type: 'object', description: 'User-defined data' },
				{ name: 'metadata', type: 'object', description: 'Thread metadata' },
			],
			statuses: [
				{ code: 200, description: 'Threads returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/thread?limit=10&sort=updated&direction=desc',
		},
		{
			id: 'get-thread',
			title: 'Get Thread',
			method: 'GET',
			path: '/thread/{id}',
			description: 'Get a specific thread by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'Thread ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Thread object.',
			statuses: [
				{ code: 200, description: 'Thread returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Thread not found' },
			],
			examplePath: '/thread/thr_abc123',
		},
		{
			id: 'delete-thread',
			title: 'Delete Thread',
			method: 'DELETE',
			path: '/thread/{id}',
			description: 'Delete a specific thread by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'Thread ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Thread deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Thread not found' },
			],
			examplePath: '/thread/thr_abc123',
		},
	],
};

export default service;
