import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'API Keys',
	slug: 'api-keys',
	description: 'Create and manage API keys for authentication',
	endpoints: [
		{
			id: 'create-api-key',
			title: 'Create API Key',
			method: 'POST',
			path: '/cli/apikey',
			description: 'Create a new API key. The key value is only returned at creation time.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'API key creation payload.',
				fields: [
					{
						name: 'name',
						type: 'string',
						description: 'Display name for the API key',
						required: true,
					},
					{
						name: 'expiresAt',
						type: 'string',
						description: 'ISO 8601 expiration timestamp',
						required: true,
					},
					{
						name: 'projectId',
						type: 'string',
						description: 'Scope to a specific project',
						required: false,
					},
					{
						name: 'orgId',
						type: 'string',
						description: 'Scope to a specific organization',
						required: false,
					},
				],
			},
			responseDescription:
				'Returns the new key ID and value. The value is only returned at creation time.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'API key ID' },
				{
					name: 'value',
					type: 'string',
					description: 'The API key — only returned at creation',
				},
			],
			statuses: [
				{ code: 201, description: 'API key created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/apikey',
			exampleBody: { name: 'My API Key', expiresAt: '2026-12-31T23:59:59Z' },
		},
		{
			id: 'list-api-keys',
			title: 'List API Keys',
			method: 'GET',
			path: '/cli/apikey',
			description: 'List API keys with optional filtering by organization or project.',
			pathParams: [],
			queryParams: [
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
			],
			requestBody: null,
			responseDescription: 'Array of API key objects.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'API key ID' },
				{ name: 'name', type: 'string', description: 'Display name' },
				{ name: 'orgId', type: 'string', description: 'Organization ID' },
				{ name: 'type', type: 'string', description: 'Key type' },
				{ name: 'expiresAt', type: 'string', description: 'Expiration timestamp' },
				{ name: 'lastUsedAt', type: 'string', description: 'Last usage timestamp' },
				{ name: 'createdAt', type: 'string', description: 'Creation timestamp' },
				{ name: 'project', type: 'object', description: 'Associated project details' },
			],
			statuses: [
				{ code: 200, description: 'API keys returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/apikey',
		},
		{
			id: 'get-api-key',
			title: 'Get API Key',
			method: 'GET',
			path: '/cli/apikey/{id}',
			description: 'Get a specific API key by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'API key ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'API key object.',
			statuses: [
				{ code: 200, description: 'API key returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'API key not found' },
			],
			examplePath: '/cli/apikey/ak_abc123',
		},
		{
			id: 'delete-api-key',
			title: 'Delete API Key',
			method: 'DELETE',
			path: '/cli/apikey/{id}',
			description: 'Delete an API key by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'API key ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'API key deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'API key not found' },
			],
			examplePath: '/cli/apikey/ak_abc123',
		},
	],
};

export default service;
