import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Organizations',
	slug: 'organizations',
	description: 'Manage organizations, environment variables, and org-level resources',
	endpoints: [
		{
			id: 'list-organizations',
			title: 'List Organizations',
			method: 'GET',
			path: '/cli/organization',
			description: 'List all organizations the authenticated user belongs to.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns all organizations the authenticated user belongs to.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Organization ID' },
				{ name: 'name', type: 'string', description: 'Organization name' },
			],
			statuses: [
				{ code: 200, description: 'Organizations returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/organization',
		},
		{
			id: 'get-env-vars',
			title: 'Get Environment Variables',
			sectionTitle: 'Environment Variables',
			method: 'GET',
			path: '/cli/organization/{id}/env',
			description: 'Retrieve environment variables and secrets for an organization.',
			pathParams: [
				{ name: 'id', type: 'string', description: 'Organization ID', required: true },
			],
			queryParams: [
				{
					name: 'mask',
					type: 'boolean',
					description: 'Mask secret values (default true)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns environment variables and secrets for the organization.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Organization ID' },
				{ name: 'env', type: 'object', description: 'Environment variables' },
				{ name: 'secrets', type: 'object', description: 'Secret values (masked by default)' },
			],
			statuses: [
				{ code: 200, description: 'Environment variables returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization not found' },
			],
			examplePath: '/cli/organization/org_abc123/env',
		},
		{
			id: 'update-env-vars',
			title: 'Update Environment Variables',
			sectionTitle: 'Environment Variables',
			method: 'PUT',
			path: '/cli/organization/{id}/env',
			description:
				'Update environment variables and secrets for an organization. Updates are merged with existing values.',
			pathParams: [
				{ name: 'id', type: 'string', description: 'Organization ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Environment variables and secrets to set.',
				fields: [
					{
						name: 'env',
						type: 'object',
						description: 'Environment variables to set',
						required: false,
					},
					{ name: 'secrets', type: 'object', description: 'Secrets to set', required: false },
				],
			},
			responseDescription: 'Updates are merged with existing values. Returns 204 on success.',
			statuses: [
				{ code: 204, description: 'Environment variables updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization not found' },
			],
			examplePath: '/cli/organization/org_abc123/env',
			exampleBody: { env: { MY_VAR: 'value' }, secrets: { API_KEY: 'sk_...' } },
		},
		{
			id: 'delete-env-vars',
			title: 'Delete Environment Variables',
			sectionTitle: 'Environment Variables',
			method: 'DELETE',
			path: '/cli/organization/{id}/env',
			description: 'Delete specific environment variables and secrets from an organization.',
			pathParams: [
				{ name: 'id', type: 'string', description: 'Organization ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Keys to delete from environment variables and secrets.',
				fields: [
					{
						name: 'env',
						type: 'array',
						description: 'Environment variable keys to delete',
						required: false,
					},
					{
						name: 'secrets',
						type: 'array',
						description: 'Secret keys to delete',
						required: false,
					},
				],
			},
			responseDescription: 'Returns 204 on success.',
			statuses: [
				{ code: 204, description: 'Environment variables deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization not found' },
			],
			examplePath: '/cli/organization/org_abc123/env',
			exampleBody: { env: ['MY_VAR'], secrets: ['OLD_KEY'] },
		},
		{
			id: 'list-resources',
			title: 'List All Resources',
			sectionTitle: 'Resources',
			method: 'GET',
			path: '/resource',
			description: 'List S3 buckets and databases across all regions.',
			pathParams: [],
			queryParams: [
				{
					name: 'type',
					type: 'string',
					description: "'all', 's3', or 'db' (default 'all')",
					required: false,
				},
				{ name: 'name', type: 'string', description: 'Filter by name', required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{
					name: 'sort',
					type: 'string',
					description: "'name', 'created', or 'region'",
					required: false,
				},
				{ name: 'direction', type: 'string', description: "'asc' or 'desc'", required: false },
			],
			requestBody: null,
			responseDescription: 'Returns S3 buckets and databases across all regions.',
			statuses: [
				{ code: 200, description: 'Resources returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/resource',
		},
	],
};

export default service;
