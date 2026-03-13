import { DbExecuteQueryRequestSchema } from './types.ts';
import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Databases',
	slug: 'database',
	description: 'Execute queries, inspect tables, and monitor database performance',
	endpoints: [
		{
			id: 'get-query-logs',
			title: 'Get Query Logs',
			method: 'GET',
			path: '/resource/{orgId}/{region}/{database}/logs',
			description: 'Get query logs for a database with optional filtering.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
				{ name: 'region', type: 'string', description: 'Region identifier', required: true },
				{ name: 'database', type: 'string', description: 'Database name', required: true },
			],
			queryParams: [
				{
					name: 'startDate',
					type: 'string',
					description: 'Start date filter',
					required: false,
				},
				{ name: 'endDate', type: 'string', description: 'End date filter', required: false },
				{
					name: 'username',
					type: 'string',
					description: 'Filter by username',
					required: false,
				},
				{
					name: 'command',
					type: 'string',
					description: 'Filter by SQL command type',
					required: false,
				},
				{
					name: 'hasError',
					type: 'boolean',
					description: 'Filter for queries with errors',
					required: false,
				},
				{
					name: 'sessionId',
					type: 'string',
					description: 'Filter by session ID',
					required: false,
				},
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum logs to return',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Array of query log entries.',
			statuses: [
				{ code: 200, description: 'Query logs returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Database not found' },
			],
			examplePath: '/resource/org_abc123/usw/mydb/logs',
		},
		{
			id: 'execute-query',
			title: 'Execute Query',
			method: 'POST',
			path: '/resource/{orgId}/{region}/{database}/query',
			description: 'Execute a SQL query against a database.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
				{ name: 'region', type: 'string', description: 'Region identifier', required: true },
				{ name: 'database', type: 'string', description: 'Database name', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'SQL query payload.',
				fields: { schema: DbExecuteQueryRequestSchema },
			},
			responseDescription:
				'Returns columns, rows, row count, and whether results were truncated (max 1000 rows).',
			statuses: [
				{ code: 200, description: 'Query executed successfully' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Database not found' },
			],
			examplePath: '/resource/org_abc123/usw/mydb/query',
			exampleBody: { query: 'SELECT * FROM users LIMIT 10' },
		},
		{
			id: 'get-query-stats',
			title: 'Get Query Stats',
			method: 'GET',
			path: '/resource/{orgId}/{region}/{database}/logs/stats',
			description: 'Get aggregate query statistics for a database over a date range.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
				{ name: 'region', type: 'string', description: 'Region identifier', required: true },
				{ name: 'database', type: 'string', description: 'Database name', required: true },
			],
			queryParams: [
				{
					name: 'startDate',
					type: 'string',
					description: 'Start date for stats range',
					required: true,
				},
				{
					name: 'endDate',
					type: 'string',
					description: 'End date for stats range',
					required: true,
				},
			],
			requestBody: null,
			responseDescription: 'Aggregate query statistics.',
			statuses: [
				{ code: 200, description: 'Query stats returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Database not found' },
			],
			examplePath: '/resource/org_abc123/usw/mydb/logs/stats',
		},
		{
			id: 'list-tables',
			title: 'List Tables',
			method: 'GET',
			path: '/resource/{orgId}/{region}/{database}/tables',
			description: 'List all tables in a database.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
				{ name: 'region', type: 'string', description: 'Region identifier', required: true },
				{ name: 'database', type: 'string', description: 'Database name', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Array of table names and metadata.',
			statuses: [
				{ code: 200, description: 'Tables returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Database not found' },
			],
			examplePath: '/resource/org_abc123/usw/mydb/tables',
		},
	],
};

export default service;
