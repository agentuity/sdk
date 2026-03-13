import { KeyValueStatsPaginatedSchema, KeyValueStatsSchema } from './service.ts';
import { CreateNamespaceApiRequestSchema, KeyValueItemMetadataSchema } from './types.ts';
import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Key-Value Storage',
	slug: 'key-value',
	description: 'Store and retrieve arbitrary data by key within namespaces',
	endpoints: [
		{
			id: 'get-value',
			title: 'Get Value',
			method: 'GET',
			path: '/kv/{namespace}/{key}',
			description:
				'Retrieve a stored value by its namespace and key. Returns the raw value with the original content type.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace name' },
				{ name: 'key', type: 'string', description: 'The key to retrieve' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Returns the raw stored value with the original content type. The response body is the value itself (not wrapped in JSON).',
			responseHeaders: [
				{
					name: 'Content-Type',
					description:
						'MIME type of the stored value (e.g., `application/json`, `text/plain`, `application/octet-stream`)',
				},
				{
					name: 'x-expires-at',
					description: 'ISO 8601 expiration timestamp. Omitted if the key does not expire.',
				},
			],
			statuses: [
				{ code: 200, description: 'Value found and returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Key does not exist in the namespace' },
			],
			examplePath: '/kv/my-namespace/user-123',
		},
		{
			id: 'set-value',
			title: 'Store Value',
			method: 'PUT',
			path: '/kv/{namespace}/{key}[/{ttl}]',
			description:
				"Store a value in key-value storage. The namespace is auto-created if it doesn't exist. Set the Content-Type header to match your data format.",
			pathParams: [
				{
					name: 'namespace',
					type: 'string',
					description: 'The namespace name (auto-created if not exists)',
				},
				{ name: 'key', type: 'string', description: 'The key to store the value under' },
				{
					name: 'ttl',
					type: 'number',
					description:
						'Optional TTL in seconds (60–31,536,000). Omit for namespace default. Use `0` for no expiration.',
					required: false,
				},
			],
			queryParams: [],
			requestBody: {
				description: 'The raw value to store. Can be any content type — JSON, text, or binary.',
			},
			responseDescription: 'Empty response on success.',
			responseHeaders: [],
			statuses: [
				{ code: 200, description: 'Value stored successfully' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 402, description: 'Payment required — upgrade to a paid plan' },
			],
			examplePath: '/kv/my-namespace/user-123',
			exampleBody: { name: 'Alice', email: 'alice@example.com' },
			ttlNote:
				'TTL behavior:\n- **Omitted**: Key inherits namespace default TTL (7 days if not configured)\n- **`0`**: Key never expires\n- **60–31,536,000**: Expires after specified seconds (values outside range are clamped)',
		},
		{
			id: 'delete-value',
			title: 'Delete Value',
			method: 'DELETE',
			path: '/kv/{namespace}/{key}',
			description: 'Delete a specific key from a namespace.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace name' },
				{ name: 'key', type: 'string', description: 'The key to delete' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			responseHeaders: [],
			statuses: [
				{ code: 200, description: 'Key deleted successfully' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/kv/my-namespace/user-123',
		},
		{
			id: 'search-keys',
			title: 'Search Keys',
			method: 'GET',
			path: '/kv/search/{namespace}/{keyword}',
			description:
				'Search for keys matching a keyword within a namespace. Returns matching keys with their values and metadata.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace to search in' },
				{
					name: 'keyword',
					type: 'string',
					description: 'The keyword to search for in key names',
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON object mapping key names to their values and metadata.',
			responseFields: {
				schema: KeyValueItemMetadataSchema,
				prefix: '{key}',
				stripRequired: true,
			},
			statuses: [
				{ code: 200, description: 'Search results returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/kv/search/my-namespace/user',
		},
		{
			id: 'get-keys',
			title: 'List Keys',
			method: 'GET',
			path: '/kv/keys/{namespace}',
			description: 'Get all key names in a namespace.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace to list keys from' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON array of key name strings.',
			responseHeaders: [],
			statuses: [
				{ code: 200, description: 'Key list returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/kv/keys/my-namespace',
		},
		{
			id: 'get-namespace-stats',
			title: 'Get Namespace Stats',
			method: 'GET',
			path: '/kv/stats/{namespace}',
			description: 'Get statistics for a specific namespace including record count and size.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace to get stats for' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON object with namespace statistics.',
			responseFields: { schema: KeyValueStatsSchema, omit: ['internal'] },
			statuses: [
				{ code: 200, description: 'Stats returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/kv/stats/my-namespace',
		},
		{
			id: 'get-all-stats',
			title: 'List All Namespace Stats',
			method: 'GET',
			path: '/kv/stats',
			description: 'Get statistics for all namespaces with optional pagination and filtering.',
			pathParams: [],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum namespaces to return (default: 100, max: 1000)',
					required: false,
				},
				{
					name: 'offset',
					type: 'number',
					description: 'Number of namespaces to skip (default: 0)',
					required: false,
				},
				{
					name: 'sort',
					type: 'string',
					description: 'Sort field: `name`, `size`, `records`, `created`, or `lastUsed`',
					required: false,
				},
				{
					name: 'direction',
					type: 'string',
					description: 'Sort direction: `asc` or `desc` (default: `desc`)',
					required: false,
				},
				{
					name: 'name',
					type: 'string',
					description: 'Filter namespaces by name substring',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Paginated response with namespace statistics.',
			responseFields: { schema: KeyValueStatsPaginatedSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Stats returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/kv/stats?limit=10&sort=size&direction=desc',
		},
		{
			id: 'list-namespaces',
			title: 'List Namespaces',
			method: 'GET',
			path: '/kv/namespaces',
			description:
				'Get all namespace names (up to 1000, ordered by creation date, most recent first).',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON array of namespace name strings.',
			responseHeaders: [],
			statuses: [
				{ code: 200, description: 'Namespace list returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/kv/namespaces',
		},
		{
			id: 'create-namespace',
			title: 'Create Namespace',
			method: 'POST',
			path: '/kv/{namespace}',
			description: 'Create a new namespace with optional default TTL configuration.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace name to create' },
			],
			queryParams: [],
			requestBody: {
				description: 'Optional JSON body with namespace configuration.',
				fields: { schema: CreateNamespaceApiRequestSchema },
			},
			responseDescription: 'Empty response on success.',
			responseHeaders: [],
			statuses: [
				{ code: 200, description: 'Namespace created successfully' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 402, description: 'Payment required' },
			],
			examplePath: '/kv/my-namespace',
			exampleBody: { default_ttl_seconds: 86400 },
		},
		{
			id: 'delete-namespace',
			title: 'Delete Namespace',
			method: 'DELETE',
			path: '/kv/{namespace}',
			description: 'Delete an entire namespace and all its keys.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace to delete' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			responseHeaders: [],
			statuses: [
				{ code: 200, description: 'Namespace deleted successfully' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/kv/my-namespace',
		},
	],
};

export default service;
