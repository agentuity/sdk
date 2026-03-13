import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Regions',
	slug: 'regions',
	description: 'List available cloud regions and manage per-region resources',
	endpoints: [
		{
			id: 'list-regions',
			title: 'List Regions',
			method: 'GET',
			path: '/cli/region',
			description: 'List all available cloud regions.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Array of region objects.',
			responseFields: [
				{ name: 'region', type: 'string', description: 'Region identifier' },
				{ name: 'description', type: 'string', description: 'Human-readable region name' },
			],
			statuses: [
				{ code: 200, description: 'Regions returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/region',
		},
		{
			id: 'list-region-resources',
			title: 'List Region Resources',
			sectionTitle: 'Resource Management',
			method: 'GET',
			path: '/resource/{orgId}/{region}',
			description: 'List resources provisioned in a specific region for an organization.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
				{ name: 'region', type: 'string', description: 'Region identifier', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Returns S3 buckets, databases, and optional Redis resources for the specified region.',
			statuses: [
				{ code: 200, description: 'Region resources returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization or region not found' },
			],
			examplePath: '/resource/org_abc123/usw',
		},
		{
			id: 'create-resources',
			title: 'Create Resources',
			sectionTitle: 'Resource Management',
			method: 'POST',
			path: '/resource/{orgId}/{region}',
			description: 'Create resources in a specific region for an organization.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
				{ name: 'region', type: 'string', description: 'Region identifier', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Resource creation payload.',
				fields: [
					{
						name: 'resources',
						type: 'array',
						description: "Array of { type: 'db'|'s3', name?, description? }",
						required: true,
					},
				],
			},
			responseDescription: 'Created resource objects.',
			statuses: [
				{ code: 201, description: 'Resources created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization or region not found' },
			],
			examplePath: '/resource/org_abc123/usw',
			exampleBody: { resources: [{ type: 'db', name: 'mydb' }] },
		},
		{
			id: 'delete-resources',
			title: 'Delete Resources',
			sectionTitle: 'Resource Management',
			method: 'DELETE',
			path: '/resource/{orgId}/{region}',
			description: 'Delete resources in a specific region for an organization.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
				{ name: 'region', type: 'string', description: 'Region identifier', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Resource deletion payload.',
				fields: [
					{
						name: 'resources',
						type: 'array',
						description: "Array of { type: 'db'|'s3', name }",
						required: true,
					},
				],
			},
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Resources deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization or region not found' },
			],
			examplePath: '/resource/org_abc123/usw',
			exampleBody: { resources: [{ type: 'db', name: 'mydb' }] },
		},
	],
};

export default service;
