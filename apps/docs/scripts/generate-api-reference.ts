import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface NamedField {
	name: string;
	type: string;
	description: string;
	required?: boolean;
}

interface RequestBody {
	description: string;
	fields?: NamedField[];
}

interface Param {
	name: string;
	type: string;
	description: string;
	required?: boolean;
}

interface EndpointStatus {
	code: number;
	description: string;
}

interface ResponseHeader {
	name: string;
	description: string;
}

interface Endpoint {
	id: string;
	title: string;
	sectionTitle?: string;
	method: HttpMethod;
	path: string;
	description: string;
	pathParams: Param[];
	queryParams: Param[];
	requestBody: RequestBody | null;
	responseDescription: string;
	responseHeaders?: ResponseHeader[];
	responseFields?: NamedField[];
	statuses: EndpointStatus[];
	examplePath: string;
	exampleBody?: string | object;
	exampleHeaders?: Record<string, string>;
	ttlNote?: string;
}

interface Service {
	name: string;
	slug: string;
	description: string;
	host?: string;
	hasPublicEndpoints?: boolean;
	endpoints: Endpoint[];
}

const kvService: Service = {
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
			responseFields: [
				{
					name: '{key}.value',
					type: 'any',
					description: 'The stored value (base64-encoded for binary)',
				},
				{
					name: '{key}.contentType',
					type: 'string',
					description: 'MIME type of the stored value',
				},
				{ name: '{key}.size', type: 'number', description: 'Size in bytes' },
				{
					name: '{key}.expiresAt',
					type: 'string | null',
					description: 'ISO 8601 expiration timestamp',
				},
				{
					name: '{key}.firstUsed',
					type: 'number | null',
					description: 'Unix timestamp (ms) of first access',
				},
				{
					name: '{key}.lastUsed',
					type: 'number | null',
					description: 'Unix timestamp (ms) of last access',
				},
				{
					name: '{key}.count',
					type: 'number | null',
					description: 'Number of times accessed',
				},
			],
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
			responseFields: [
				{ name: 'sum', type: 'number', description: 'Total size in bytes' },
				{ name: 'count', type: 'number', description: 'Number of records in the namespace' },
				{
					name: 'createdAt',
					type: 'number',
					description: 'Unix timestamp (ms) when the namespace was created',
				},
				{
					name: 'lastUsedAt',
					type: 'number',
					description: 'Unix timestamp (ms) when the namespace was last used',
				},
			],
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
			responseFields: [
				{
					name: 'namespaces',
					type: 'object',
					description: 'Map of namespace names to their statistics',
				},
				{
					name: 'total',
					type: 'number',
					description: 'Total number of namespaces across all pages',
				},
				{ name: 'limit', type: 'number', description: 'Number of namespaces per page' },
				{ name: 'offset', type: 'number', description: 'Number of namespaces skipped' },
				{
					name: 'hasMore',
					type: 'boolean',
					description: 'Whether more namespaces are available',
				},
			],
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
				fields: [
					{
						name: 'default_ttl_seconds',
						type: 'number',
						description:
							'Default TTL for keys in this namespace (in seconds). If omitted, defaults to 7 days (604,800). Use 0 for keys that never expire.',
						required: false,
					},
				],
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

const vectorService: Service = {
	name: 'Vector Search',
	slug: 'vector',
	description: 'Semantic search with automatic embedding generation',
	endpoints: [
		{
			id: 'upsert-vectors',
			title: 'Upsert Vectors',
			method: 'PUT',
			path: '/vector/{namespace}',
			description:
				'Create or update vectors in a namespace. Provide either `document` (auto-embeds) or pre-computed `embeddings` per item.',
			pathParams: [{ name: 'namespace', type: 'string', description: 'The namespace name' }],
			queryParams: [],
			requestBody: {
				description: 'JSON array of vector documents to upsert.',
				fields: [
					{ name: '[].key', type: 'string', description: 'Unique vector key', required: true },
					{
						name: '[].document',
						type: 'string',
						description: 'Source text used for automatic embedding generation',
						required: false,
					},
					{
						name: '[].embeddings',
						type: 'number[]',
						description: 'Pre-computed embedding vector',
						required: false,
					},
					{
						name: '[].metadata',
						type: 'object',
						description: 'Optional metadata for filtering and retrieval',
						required: false,
					},
					{
						name: '[].ttl',
						type: 'number | null',
						description: 'TTL in seconds. `null`/`0` means never expire.',
						required: false,
					},
				],
			},
			responseDescription: 'JSON response with inserted/updated vector IDs.',
			responseFields: [
				{ name: 'success', type: 'boolean', description: 'Whether the request succeeded' },
				{ name: 'data[].id', type: 'string', description: 'Stored vector ID' },
			],
			statuses: [
				{ code: 200, description: 'Vectors upserted successfully' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 402, description: 'Payment required — upgrade to a paid plan' },
			],
			examplePath: '/vector/products',
			exampleBody: [
				{
					key: 'chair-001',
					document: 'Comfortable office chair with lumbar support',
					metadata: { category: 'furniture', price: 299 },
				},
			],
			ttlNote:
				'TTL behavior:\n- **Omitted**: Vector expires after 30 days (default)\n- **`null` or `0`**: Vector never expires\n- **60–7,776,000**: Expires after specified seconds (values outside range are clamped)',
		},
		{
			id: 'get-vector',
			title: 'Get Vector',
			method: 'GET',
			path: '/vector/{namespace}/{key}',
			description: 'Fetch a vector by namespace and key.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace name' },
				{ name: 'key', type: 'string', description: 'The vector key' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'JSON response with vector data, metadata, similarity, and expiration fields.',
			responseFields: [
				{ name: 'success', type: 'boolean', description: 'Whether the request succeeded' },
				{ name: 'data.id', type: 'string', description: 'Internal vector ID' },
				{ name: 'data.key', type: 'string', description: 'Vector key' },
				{ name: 'data.document', type: 'string', description: 'Original source document text' },
				{ name: 'data.embeddings', type: 'number[]', description: 'Stored embeddings array' },
				{ name: 'data.metadata', type: 'object', description: 'Stored metadata' },
				{
					name: 'data.similarity',
					type: 'number',
					description: 'Similarity score when relevant',
				},
				{
					name: 'data.expiresAt',
					type: 'string | null',
					description: 'ISO 8601 expiration timestamp',
				},
			],
			statuses: [
				{ code: 200, description: 'Vector found and returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Vector not found' },
			],
			examplePath: '/vector/products/chair-001',
		},
		{
			id: 'search-vectors',
			title: 'Search Vectors',
			method: 'POST',
			path: '/vector/search/{namespace}',
			description: 'Run semantic similarity search in a namespace.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace to search' },
			],
			queryParams: [],
			requestBody: {
				description: 'Search criteria and filters.',
				fields: [
					{
						name: 'query',
						type: 'string',
						description: 'The text query for semantic search',
						required: true,
					},
					{
						name: 'limit',
						type: 'number',
						description: 'Maximum results to return (default: 10)',
						required: false,
					},
					{
						name: 'similarity',
						type: 'number',
						description: 'Minimum similarity threshold (0–1)',
						required: false,
					},
					{
						name: 'metadata',
						type: 'object',
						description: 'Filter by metadata key-value pairs',
						required: false,
					},
				],
			},
			responseDescription: 'JSON response containing matching vectors and similarity scores.',
			responseFields: [
				{ name: 'success', type: 'boolean', description: 'Whether the request succeeded' },
				{ name: 'data[].id', type: 'string', description: 'Vector ID' },
				{ name: 'data[].key', type: 'string', description: 'Vector key' },
				{ name: 'data[].metadata', type: 'object', description: 'Vector metadata' },
				{ name: 'data[].similarity', type: 'number', description: 'Similarity score (0–1)' },
				{
					name: 'data[].expiresAt',
					type: 'string | null',
					description: 'ISO 8601 expiration timestamp',
				},
			],
			statuses: [
				{ code: 200, description: 'Search results returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Namespace not found (returns empty array)' },
			],
			examplePath: '/vector/search/products',
			exampleBody: { query: 'comfortable seating for office', limit: 5, similarity: 0.7 },
		},
		{
			id: 'delete-vector',
			title: 'Delete Vector',
			method: 'DELETE',
			path: '/vector/{namespace}/{key}',
			description: 'Delete a single vector by key.',
			pathParams: [
				{ name: 'namespace', type: 'string', description: 'The namespace name' },
				{ name: 'key', type: 'string', description: 'The vector key to delete' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON response with deleted row count.',
			responseFields: [
				{ name: 'success', type: 'boolean', description: 'Whether the request succeeded' },
				{ name: 'data', type: 'number', description: 'Number of deleted vectors (0 or 1)' },
			],
			statuses: [
				{ code: 200, description: 'Delete operation completed' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Vector not found (returns 0)' },
			],
			examplePath: '/vector/products/chair-001',
		},
		{
			id: 'delete-multiple-vectors',
			title: 'Delete Multiple Vectors',
			method: 'DELETE',
			path: '/vector/{namespace}',
			description:
				'Delete multiple vectors by key. If no body is provided, deletes the entire namespace.',
			pathParams: [{ name: 'namespace', type: 'string', description: 'The namespace name' }],
			queryParams: [],
			requestBody: {
				description: 'Optional JSON body specifying keys to delete.',
				fields: [
					{
						name: 'keys',
						type: 'string[]',
						description: 'Vector keys to delete',
						required: false,
					},
				],
			},
			responseDescription: 'JSON response with number of deleted vectors.',
			responseFields: [
				{ name: 'success', type: 'boolean', description: 'Whether the request succeeded' },
				{ name: 'data', type: 'number', description: 'Number of deleted vectors' },
			],
			statuses: [
				{ code: 200, description: 'Delete operation completed' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/vector/products',
			exampleBody: { keys: ['chair-001', 'desk-001'] },
		},
		{
			id: 'get-vector-namespace-stats',
			title: 'Get Namespace Stats',
			method: 'GET',
			path: '/vector/stats/{namespace}',
			description: 'Get aggregate stats for a namespace.',
			pathParams: [{ name: 'namespace', type: 'string', description: 'The namespace name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON object with namespace size and usage statistics.',
			responseFields: [
				{ name: 'sum', type: 'number', description: 'Total size in bytes' },
				{ name: 'count', type: 'number', description: 'Number of vectors' },
				{ name: 'createdAt', type: 'number', description: 'Unix timestamp (ms)' },
				{ name: 'lastUsed', type: 'number', description: 'Unix timestamp (ms)' },
				{
					name: 'sampledResults',
					type: 'object',
					description: 'Sample of vectors (up to 20)',
					required: false,
				},
			],
			statuses: [
				{ code: 200, description: 'Stats returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Namespace not found (returns zeros)' },
			],
			examplePath: '/vector/stats/products',
		},
		{
			id: 'list-all-vector-namespace-stats',
			title: 'List All Namespace Stats',
			method: 'GET',
			path: '/vector/stats',
			description: 'List namespace stats with pagination, filtering, and sorting.',
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
					description: 'Offset for pagination',
					required: false,
				},
				{
					name: 'sort',
					type: 'string',
					description: 'Sort by `name`, `size`, `records`, `created`, or `lastUsed`',
					required: false,
				},
				{
					name: 'direction',
					type: 'string',
					description: 'Sort direction: `asc` or `desc`',
					required: false,
				},
				{
					name: 'name',
					type: 'string',
					description: 'Filter namespaces by name',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Paginated namespace stats response.',
			responseFields: [
				{ name: 'namespaces', type: 'object', description: 'Map of namespace names to stats' },
				{ name: 'total', type: 'number', description: 'Total namespace count' },
				{ name: 'limit', type: 'number', description: 'Applied page limit' },
				{ name: 'offset', type: 'number', description: 'Applied offset' },
				{ name: 'hasMore', type: 'boolean', description: 'Whether more results exist' },
			],
			statuses: [
				{ code: 200, description: 'Stats returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/vector/stats?limit=10&sort=size&direction=desc',
		},
		{
			id: 'list-vector-namespaces',
			title: 'List Namespaces',
			method: 'GET',
			path: '/vector/namespaces',
			description: 'List namespace names (up to 1000).',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON array of namespace names.',
			statuses: [
				{ code: 200, description: 'Namespace list returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/vector/namespaces',
		},
	],
};

const objectStorageService: Service = {
	name: 'Object Storage',
	slug: 'object-storage',
	description: 'Store and manage files and binary objects in buckets',
	endpoints: [
		{
			id: 'list-objects',
			title: 'List Objects',
			method: 'GET',
			path: '/storage/objects/{bucket}',
			description: 'List objects in a bucket with optional prefix and pagination.',
			pathParams: [{ name: 'bucket', type: 'string', description: 'Bucket name' }],
			queryParams: [
				{
					name: 'prefix',
					type: 'string',
					description: 'Only return keys with this prefix',
					required: false,
				},
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum objects to return',
					required: false,
				},
				{
					name: 'offset',
					type: 'number',
					description: 'Offset for pagination',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Paginated object listing.',
			responseFields: [
				{ name: 'objects', type: 'array', description: 'List of object metadata records' },
				{
					name: 'objects[].bucket_name',
					type: 'string',
					description: 'Bucket containing the object',
				},
				{ name: 'objects[].key', type: 'string', description: 'Object key' },
				{ name: 'objects[].size', type: 'number', description: 'Object size in bytes' },
				{ name: 'objects[].etag', type: 'string', description: 'Entity tag' },
				{ name: 'objects[].content_type', type: 'string', description: 'MIME content type' },
				{
					name: 'objects[].last_modified',
					type: 'string',
					description: 'Last modified timestamp',
				},
				{ name: 'total', type: 'number', description: 'Total matching objects' },
				{ name: 'prefix', type: 'string', description: 'Applied prefix filter' },
				{ name: 'limit', type: 'number', description: 'Applied limit' },
				{ name: 'offset', type: 'number', description: 'Applied offset' },
			],
			statuses: [
				{ code: 200, description: 'Object list returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/storage/objects/my-bucket?prefix=images/&limit=50',
		},
		{
			id: 'delete-objects',
			title: 'Delete Objects',
			method: 'DELETE',
			path: '/storage/objects/{bucket}',
			description:
				'Delete objects by key or by prefix. `key` and `prefix` are mutually exclusive query parameters.',
			pathParams: [{ name: 'bucket', type: 'string', description: 'Bucket name' }],
			queryParams: [
				{
					name: 'key',
					type: 'string',
					description: 'Delete a single object key',
					required: false,
				},
				{
					name: 'prefix',
					type: 'string',
					description: 'Delete all objects matching prefix',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'JSON response with deleted object count.',
			responseFields: [
				{ name: 'deleted_count', type: 'number', description: 'Number of objects deleted' },
			],
			statuses: [
				{ code: 200, description: 'Delete operation completed' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/storage/objects/my-bucket?key=images/photo.jpg',
		},
		{
			id: 'generate-presigned-url',
			title: 'Generate Presigned URL',
			method: 'GET',
			path: '/storage/presign/{bucket}',
			description: 'Generate a time-limited URL for uploading or downloading an object.',
			pathParams: [{ name: 'bucket', type: 'string', description: 'Bucket name' }],
			queryParams: [
				{ name: 'key', type: 'string', description: 'Object key to access', required: true },
				{
					name: 'operation',
					type: 'string',
					description: 'Operation type: `download` or `upload` (default: `download`)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'JSON response containing presigned URL and expiry.',
			responseFields: [
				{ name: 'presigned_url', type: 'string', description: 'Temporary signed URL' },
				{ name: 'expiry_seconds', type: 'number', description: 'URL expiry in seconds' },
			],
			statuses: [
				{ code: 200, description: 'Presigned URL generated' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/storage/presign/my-bucket?key=images/photo.jpg&operation=download',
		},
		{
			id: 'get-bucket-stats',
			title: 'Get Bucket Stats',
			method: 'GET',
			path: '/storage/stats/{bucket}',
			description: 'Get object count and total size for a bucket.',
			pathParams: [{ name: 'bucket', type: 'string', description: 'Bucket name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Bucket-level usage and activity statistics.',
			responseFields: [
				{ name: 'bucket_name', type: 'string', description: 'Bucket name' },
				{ name: 'object_count', type: 'number', description: 'Total number of objects' },
				{ name: 'total_size', type: 'number', description: 'Total size in bytes' },
				{
					name: 'last_event_at',
					type: 'string | null',
					description: 'Last activity timestamp (ISO 8601)',
				},
			],
			statuses: [
				{ code: 200, description: 'Bucket stats returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/storage/stats/my-bucket',
		},
		{
			id: 'get-storage-analytics',
			title: 'Get Storage Analytics',
			method: 'GET',
			path: '/storage/analytics',
			description: 'Get aggregated analytics across buckets and daily snapshots.',
			pathParams: [],
			queryParams: [
				{
					name: 'days',
					type: 'number',
					description: 'Days of history to include (default: 180)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Analytics summary, per-bucket breakdown, and daily trend data.',
			responseFields: [
				{ name: 'summary', type: 'object', description: 'Overall storage summary' },
				{
					name: 'summary.total_object_count',
					type: 'number',
					description: 'Total objects across buckets',
				},
				{
					name: 'summary.total_size',
					type: 'number',
					description: 'Total bytes across buckets',
				},
				{
					name: 'summary.estimated_monthly_cost',
					type: 'number',
					description: 'Estimated monthly storage cost',
				},
				{
					name: 'summary.cost_per_gb_month',
					type: 'number',
					description: 'Cost per GB-month used in estimate',
				},
				{ name: 'buckets', type: 'array', description: 'Per-bucket stats' },
				{ name: 'daily', type: 'array', description: 'Daily usage snapshots' },
				{ name: 'days', type: 'number', description: 'Applied history window in days' },
			],
			statuses: [
				{ code: 200, description: 'Analytics returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/storage/analytics?days=30',
		},
		{
			id: 'get-bucket-config',
			title: 'Get Bucket Config',
			method: 'GET',
			path: '/bucket/config/{bucket}',
			description: 'Retrieve effective configuration for a bucket.',
			pathParams: [{ name: 'bucket', type: 'string', description: 'Bucket name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Bucket configuration settings and location metadata.',
			responseFields: [
				{ name: 'bucket_name', type: 'string', description: 'Bucket name' },
				{
					name: 'storage_tier',
					type: 'string | null',
					description: '`STANDARD`, `INFREQUENT_ACCESS`, or `ARCHIVE`',
				},
				{ name: 'ttl', type: 'number | null', description: 'Default object TTL in seconds' },
				{
					name: 'public',
					type: 'boolean | null',
					description: 'Whether objects are publicly accessible',
				},
				{
					name: 'cache_control',
					type: 'string | null',
					description: 'Default Cache-Control header',
				},
				{ name: 'cors', type: 'object | null', description: 'CORS configuration' },
				{
					name: 'additional_headers',
					type: 'object | null',
					description: 'Additional response headers',
				},
				{
					name: 'bucket_location',
					type: 'string | null',
					description: 'Bucket storage location/region',
				},
			],
			statuses: [
				{ code: 200, description: 'Bucket config returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/bucket/config/my-bucket',
		},
		{
			id: 'update-bucket-config',
			title: 'Update Bucket Config',
			method: 'PUT',
			path: '/bucket/config/{bucket}',
			description: 'Update bucket configuration fields. Omitted fields remain unchanged.',
			pathParams: [{ name: 'bucket', type: 'string', description: 'Bucket name' }],
			queryParams: [],
			requestBody: {
				description: 'Partial bucket config update payload.',
				fields: [
					{
						name: 'storage_tier',
						type: 'string',
						description: 'Storage tier override',
						required: false,
					},
					{
						name: 'ttl',
						type: 'number | null',
						description: 'Default TTL in seconds',
						required: false,
					},
					{
						name: 'public',
						type: 'boolean',
						description: 'Public access setting',
						required: false,
					},
					{
						name: 'cache_control',
						type: 'string',
						description: 'Default Cache-Control header',
						required: false,
					},
					{ name: 'cors', type: 'object', description: 'CORS configuration', required: false },
					{
						name: 'additional_headers',
						type: 'object',
						description: 'Additional response headers',
						required: false,
					},
				],
			},
			responseDescription: 'Updated bucket configuration object.',
			responseFields: [
				{ name: 'bucket_name', type: 'string', description: 'Bucket name' },
				{ name: 'storage_tier', type: 'string | null', description: 'Configured storage tier' },
				{ name: 'ttl', type: 'number | null', description: 'Configured TTL' },
				{ name: 'public', type: 'boolean | null', description: 'Configured public access' },
				{
					name: 'cache_control',
					type: 'string | null',
					description: 'Configured Cache-Control',
				},
				{ name: 'cors', type: 'object | null', description: 'Configured CORS settings' },
				{
					name: 'additional_headers',
					type: 'object | null',
					description: 'Configured custom headers',
				},
				{ name: 'bucket_location', type: 'string | null', description: 'Bucket location' },
			],
			statuses: [
				{ code: 200, description: 'Bucket config updated' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/bucket/config/my-bucket',
			exampleBody: { ttl: 86400, public: true, cache_control: 'max-age=3600' },
		},
		{
			id: 'delete-bucket-config',
			title: 'Delete Bucket Config',
			method: 'DELETE',
			path: '/bucket/config/{bucket}',
			description: 'Delete custom bucket config and reset to defaults.',
			pathParams: [{ name: 'bucket', type: 'string', description: 'Bucket name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Bucket config deleted/reset' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/bucket/config/my-bucket',
		},
	],
};

const streamsService: Service = {
	name: 'Durable Streams',
	slug: 'streams',
	description: 'Create durable, resumable data streams with public URLs',
	host: 'pulse',
	endpoints: [
		{
			id: 'create-stream',
			title: 'Create Stream',
			method: 'POST',
			path: '/stream',
			description: 'Create a new stream and receive its stream ID.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Stream creation payload.',
				fields: [
					{
						name: 'name',
						type: 'string',
						description: 'The namespace/group name (1–254 chars)',
						required: true,
					},
					{
						name: 'metadata',
						type: 'object',
						description: 'Optional key-value metadata',
						required: false,
					},
					{
						name: 'headers',
						type: 'object',
						description: 'Optional headers map (commonly includes `content-type`)',
						required: false,
					},
					{
						name: 'ttl',
						type: 'number | null',
						description: 'Stream TTL in seconds',
						required: false,
					},
				],
			},
			responseDescription: 'JSON response containing the new stream ID.',
			responseFields: [{ name: 'id', type: 'string', description: 'Created stream ID' }],
			statuses: [
				{ code: 200, description: 'Stream created successfully' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 402, description: 'Payment required' },
			],
			examplePath: '/stream',
			exampleBody: {
				name: 'agent-logs',
				metadata: { exportDate: '2024-01-15' },
				headers: { 'content-type': 'application/json' },
			},
			ttlNote:
				'TTL behavior:\n- **Omitted**: Stream expires after the service default period\n- **`null` or `0`**: Stream never expires\n- **60–7,776,000**: Expires after specified seconds (values outside range are clamped)',
		},
		{
			id: 'get-stream-info',
			title: 'Get Stream Info',
			method: 'POST',
			path: '/stream/{id}/info',
			description: 'Get stream metadata, size, public URL, and expiration info.',
			pathParams: [{ name: 'id', type: 'string', description: 'The stream ID' }],
			queryParams: [],
			requestBody: {
				description: 'Empty JSON object is required.',
			},
			responseDescription: 'JSON object with stream details.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Stream ID' },
				{ name: 'name', type: 'string', description: 'Namespace name' },
				{ name: 'metadata', type: 'object', description: 'Stream metadata' },
				{ name: 'url', type: 'string', description: 'Public stream URL' },
				{ name: 'size_bytes', type: 'number', description: 'Current stream size in bytes' },
				{
					name: 'expires_at',
					type: 'string | null',
					description: 'ISO 8601 expiration timestamp',
				},
			],
			statuses: [
				{ code: 200, description: 'Stream info returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Stream not found' },
			],
			examplePath: '/stream/stream_abc123/info',
			exampleBody: {},
		},
		{
			id: 'download-stream',
			title: 'Download Stream',
			method: 'GET',
			path: '/stream/{id}',
			description: 'Download the finalized stream contents as raw binary data.',
			pathParams: [{ name: 'id', type: 'string', description: 'The stream ID' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Raw binary stream data with original content type.',
			statuses: [
				{ code: 200, description: 'Stream data returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Stream not found' },
			],
			examplePath: '/stream/stream_abc123',
		},
		{
			id: 'list-streams',
			title: 'List Streams',
			method: 'POST',
			path: '/stream/list',
			description: 'List streams with filtering, pagination, and sorting.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Optional list filters and pagination controls.',
				fields: [
					{
						name: 'name',
						type: 'string',
						description: 'Filter by namespace',
						required: false,
					},
					{
						name: 'metadata',
						type: 'object',
						description: 'Filter by metadata fields',
						required: false,
					},
					{
						name: 'limit',
						type: 'number',
						description: 'Maximum streams to return',
						required: false,
					},
					{
						name: 'offset',
						type: 'number',
						description: 'Offset for pagination',
						required: false,
					},
					{
						name: 'sort',
						type: 'string',
						description:
							'Sort by `name`, `created`, `updated`, `size`, `count`, or `lastUsed`',
						required: false,
					},
					{
						name: 'direction',
						type: 'string',
						description: 'Sort direction: `asc` or `desc`',
						required: false,
					},
				],
			},
			responseDescription: 'JSON response with stream list and total count.',
			responseFields: [
				{ name: 'success', type: 'boolean', description: 'Whether the request succeeded' },
				{ name: 'streams', type: 'array', description: 'Matching streams' },
				{ name: 'streams[].id', type: 'string', description: 'Stream ID' },
				{ name: 'streams[].name', type: 'string', description: 'Namespace' },
				{ name: 'streams[].metadata', type: 'object', description: 'Stream metadata' },
				{ name: 'streams[].url', type: 'string', description: 'Public URL' },
				{ name: 'streams[].size_bytes', type: 'number', description: 'Size in bytes' },
				{
					name: 'streams[].expires_at',
					type: 'string | null',
					description: 'Expiration timestamp',
				},
				{ name: 'total', type: 'number', description: 'Total matches' },
			],
			statuses: [
				{ code: 200, description: 'Stream list returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/stream/list',
			exampleBody: { name: 'agent-logs', limit: 50 },
		},
		{
			id: 'delete-stream',
			title: 'Delete Stream',
			method: 'DELETE',
			path: '/stream/{id}',
			description: 'Delete a stream by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'The stream ID' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Stream deleted' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Stream not found' },
			],
			examplePath: '/stream/stream_abc123',
		},
		{
			id: 'append-data',
			title: 'Append Data',
			method: 'POST',
			path: '/stream/{id}/append',
			description: 'Append a binary chunk (up to 5MB) to an open stream.',
			pathParams: [{ name: 'id', type: 'string', description: 'The stream ID' }],
			queryParams: [],
			requestBody: {
				description: 'Raw binary body. Set `Content-Type: application/octet-stream`.',
			},
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Data appended' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 413, description: 'Chunk too large' },
			],
			examplePath: '/stream/stream_abc123/append',
			exampleHeaders: { 'Content-Type': 'application/octet-stream' },
			exampleBody: '<binary data>',
		},
		{
			id: 'complete-stream',
			title: 'Complete Stream',
			method: 'POST',
			path: '/stream/{id}/complete',
			description: 'Finalize stream writing and make it available for reading.',
			pathParams: [{ name: 'id', type: 'string', description: 'The stream ID' }],
			queryParams: [],
			requestBody: {
				description:
					'Empty body. Optional header: `X-Compress: gzip` for server-side compression.',
			},
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Stream completed' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/stream/stream_abc123/complete',
		},
	],
};

const queuesService: Service = {
	name: 'Message Queues',
	slug: 'queues',
	description: 'Publish, consume, and manage messages with worker and pub/sub queues',
	endpoints: [
		{
			id: 'create-queue',
			title: 'Create Queue',
			sectionTitle: 'Queue Management',
			method: 'POST',
			path: '/queue/create',
			description: 'Create a queue. If `name` is omitted, a name is auto-generated.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Queue creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Queue name', required: false },
					{
						name: 'queue_type',
						type: 'string',
						description: '`worker` or `pubsub`',
						required: true,
					},
					{
						name: 'description',
						type: 'string',
						description: 'Queue description',
						required: false,
					},
					{
						name: 'settings',
						type: 'object',
						description: 'Queue behavior settings',
						required: false,
					},
				],
			},
			responseDescription: 'Queue object including settings, stats, and timestamps.',
			statuses: [
				{ code: 200, description: 'Queue created' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 402, description: 'Payment required' },
			],
			examplePath: '/queue/create',
			exampleBody: {
				name: 'order-processing',
				queue_type: 'worker',
				description: 'Processes customer orders',
				settings: { default_max_retries: 3, default_visibility_timeout_seconds: 60 },
			},
		},
		{
			id: 'get-queue',
			title: 'Get Queue',
			sectionTitle: 'Queue Management',
			method: 'GET',
			path: '/queue/get/{name}',
			description: 'Get a queue by name.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Queue object.',
			statuses: [
				{ code: 200, description: 'Queue returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/get/order-processing',
		},
		{
			id: 'list-queues',
			title: 'List Queues',
			sectionTitle: 'Queue Management',
			method: 'GET',
			path: '/queue/list',
			description: 'List queues with filtering and pagination.',
			pathParams: [],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum queues to return',
					required: false,
				},
				{
					name: 'offset',
					type: 'number',
					description: 'Offset for pagination',
					required: false,
				},
				{ name: 'name', type: 'string', description: 'Filter by queue name', required: false },
				{
					name: 'queue_type',
					type: 'string',
					description: '`worker` or `pubsub`',
					required: false,
				},
				{
					name: 'status',
					type: 'string',
					description: '`active` or `paused`',
					required: false,
				},
				{ name: 'sort', type: 'string', description: 'Sort field', required: false },
				{ name: 'direction', type: 'string', description: '`asc` or `desc`', required: false },
			],
			requestBody: null,
			responseDescription: 'Response with queue array and optional total count.',
			responseFields: [
				{ name: 'queues', type: 'Queue[]', description: 'Queues in the current page' },
				{
					name: 'total',
					type: 'number',
					description: 'Optional total queue count',
					required: false,
				},
			],
			statuses: [
				{ code: 200, description: 'Queues returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/queue/list?limit=10&queue_type=worker',
		},
		{
			id: 'update-queue',
			title: 'Update Queue',
			sectionTitle: 'Queue Management',
			method: 'PATCH',
			path: '/queue/update/{name}',
			description: 'Partially update queue description/settings.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: {
				description: 'Partial queue update payload.',
				fields: [
					{
						name: 'description',
						type: 'string',
						description: 'Updated description',
						required: false,
					},
					{
						name: 'settings',
						type: 'object',
						description: 'Partial settings update',
						required: false,
					},
				],
			},
			responseDescription: 'Updated queue object.',
			statuses: [
				{ code: 200, description: 'Queue updated' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/update/order-processing',
			exampleBody: { description: 'Updated', settings: { default_max_retries: 5 } },
		},
		{
			id: 'delete-queue',
			title: 'Delete Queue',
			sectionTitle: 'Queue Management',
			method: 'DELETE',
			path: '/queue/delete/{name}',
			description: 'Delete a queue and associated resources.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Queue deleted' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/delete/order-processing',
		},
		{
			id: 'pause-queue',
			title: 'Pause Queue',
			sectionTitle: 'Queue Management',
			method: 'POST',
			path: '/queue/pause/{name}',
			description: 'Pause queue processing.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: { description: 'Empty JSON object is required.' },
			responseDescription: 'Queue object with `paused_at` set.',
			statuses: [
				{ code: 200, description: 'Queue paused' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/pause/order-processing',
			exampleBody: {},
		},
		{
			id: 'resume-queue',
			title: 'Resume Queue',
			sectionTitle: 'Queue Management',
			method: 'POST',
			path: '/queue/resume/{name}',
			description: 'Resume queue processing.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: { description: 'Empty JSON object is required.' },
			responseDescription: 'Queue object with `paused_at` cleared.',
			statuses: [
				{ code: 200, description: 'Queue resumed' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/resume/order-processing',
			exampleBody: {},
		},
		{
			id: 'publish-message',
			title: 'Publish Message',
			sectionTitle: 'Message Operations',
			method: 'POST',
			path: '/queue/messages/publish/{name}',
			description: 'Publish a single message to a queue.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [
				{
					name: 'sync',
					type: 'boolean',
					description: 'Set `true` for synchronous publish',
					required: false,
				},
			],
			requestBody: {
				description: 'Message payload and optional delivery controls.',
				fields: [
					{ name: 'payload', type: 'any', description: 'Message payload', required: true },
					{
						name: 'metadata',
						type: 'object',
						description: 'Message metadata',
						required: false,
					},
					{
						name: 'partition_key',
						type: 'string',
						description: 'Partition key for routing',
						required: false,
					},
					{
						name: 'idempotency_key',
						type: 'string',
						description: 'Idempotency key',
						required: false,
					},
					{
						name: 'ttl_seconds',
						type: 'number',
						description: 'Message TTL in seconds',
						required: false,
					},
				],
			},
			responseDescription: 'Published message object.',
			statuses: [
				{ code: 200, description: 'Message published' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/messages/publish/order-processing',
			exampleBody: {
				payload: { orderId: 123, action: 'process' },
				metadata: { priority: 'high' },
			},
		},
		{
			id: 'batch-publish',
			title: 'Batch Publish',
			sectionTitle: 'Message Operations',
			method: 'POST',
			path: '/queue/messages/batch/{name}',
			description: 'Publish up to 1000 messages in one request.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: {
				description: 'Batch publish payload.',
				fields: [
					{
						name: 'messages',
						type: 'array',
						description: 'Array of message payload objects (max 1000)',
						required: true,
					},
				],
			},
			responseDescription:
				'Batch publish response with created messages and optional failed indexes.',
			responseFields: [
				{ name: 'messages', type: 'Message[]', description: 'Published messages' },
				{
					name: 'failed',
					type: 'number[]',
					description: 'Indexes that failed',
					required: false,
				},
			],
			statuses: [
				{ code: 200, description: 'Batch publish completed' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/messages/batch/order-processing',
			exampleBody: { messages: [{ payload: { orderId: 1 } }, { payload: { orderId: 2 } }] },
		},
		{
			id: 'get-message',
			title: 'Get Message',
			sectionTitle: 'Message Operations',
			method: 'GET',
			path: '/queue/messages/get/{name}/{messageId}',
			description: 'Get a message by message ID (`msg_...`).',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'messageId', type: 'string', description: 'Message ID (`msg_...`)' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Message object.',
			statuses: [
				{ code: 200, description: 'Message returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Message or queue not found' },
			],
			examplePath: '/queue/messages/get/order-processing/msg_abc123',
		},
		{
			id: 'get-message-by-offset',
			title: 'Get Message by Offset',
			sectionTitle: 'Message Operations',
			method: 'GET',
			path: '/queue/messages/offset/{name}/{offset}',
			description: 'Get a message by numeric offset.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'offset', type: 'number', description: 'Message offset' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Message object.',
			statuses: [
				{ code: 200, description: 'Message returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Message or queue not found' },
			],
			examplePath: '/queue/messages/offset/order-processing/42',
		},
		{
			id: 'list-messages',
			title: 'List Messages',
			sectionTitle: 'Message Operations',
			method: 'GET',
			path: '/queue/messages/list/{name}',
			description: 'List messages with pagination and optional state filter.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum messages to return',
					required: false,
				},
				{
					name: 'offset',
					type: 'number',
					description: 'Offset for pagination',
					required: false,
				},
				{
					name: 'state',
					type: 'string',
					description: '`pending`, `processing`, `completed`, `failed`, or `dead`',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Response with message list and optional total count.',
			responseFields: [
				{ name: 'messages', type: 'Message[]', description: 'Messages in current page' },
				{
					name: 'total',
					type: 'number',
					description: 'Optional total message count',
					required: false,
				},
			],
			statuses: [
				{ code: 200, description: 'Messages returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/messages/list/order-processing?limit=20&state=pending',
		},
		{
			id: 'delete-message',
			title: 'Delete Message',
			sectionTitle: 'Message Operations',
			method: 'DELETE',
			path: '/queue/messages/delete/{name}/{messageId}',
			description: 'Delete a message by ID.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'messageId', type: 'string', description: 'Message ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Message deleted' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Message or queue not found' },
			],
			examplePath: '/queue/messages/delete/order-processing/msg_abc123',
		},
		{
			id: 'replay-message',
			title: 'Replay Message',
			sectionTitle: 'Message Operations',
			method: 'POST',
			path: '/queue/messages/replay/{name}/{messageId}',
			description: 'Replay a message back into the queue flow.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'messageId', type: 'string', description: 'Message ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Replayed message object.',
			statuses: [
				{ code: 200, description: 'Message replayed' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Message or queue not found' },
			],
			examplePath: '/queue/messages/replay/order-processing/msg_abc123',
		},
		{
			id: 'consume-messages',
			title: 'Consume Messages',
			sectionTitle: 'Message Operations',
			method: 'GET',
			path: '/queue/consume/{name}',
			description:
				'Log-style consumption starting from offset. Does not mark messages as processing.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [
				{ name: 'offset', type: 'number', description: 'Starting offset', required: true },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum messages to return',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Response containing consumed messages.',
			responseFields: [
				{ name: 'messages', type: 'Message[]', description: 'Consumed messages' },
			],
			statuses: [
				{ code: 200, description: 'Messages consumed' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/consume/order-processing?offset=0&limit=10',
		},
		{
			id: 'receive-message',
			title: 'Receive Message',
			sectionTitle: 'Message Operations',
			method: 'GET',
			path: '/queue/receive/{name}',
			description:
				'Atomically receive and lock the next pending message. Must ack/nack when done.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [
				{
					name: 'timeout',
					type: 'number',
					description: 'Long-poll timeout in seconds (0–30)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Response containing a message or `null` when none available.',
			responseFields: [
				{
					name: 'message',
					type: 'Message | null',
					description: 'Received message if available',
				},
			],
			statuses: [
				{ code: 200, description: 'Receive operation completed' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/receive/order-processing?timeout=10',
		},
		{
			id: 'ack-message',
			title: 'Acknowledge Message',
			sectionTitle: 'Message Operations',
			method: 'POST',
			path: '/queue/ack/{name}/{messageId}',
			description: 'Mark message as successfully processed (completed).',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'messageId', type: 'string', description: 'Message ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Message acknowledged' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Message or queue not found' },
			],
			examplePath: '/queue/ack/order-processing/msg_abc123',
		},
		{
			id: 'nack-message',
			title: 'Negative Acknowledge',
			sectionTitle: 'Message Operations',
			method: 'POST',
			path: '/queue/nack/{name}/{messageId}',
			description: 'Return message for retry. After max retries, moves to DLQ.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'messageId', type: 'string', description: 'Message ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Message negatively acknowledged' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Message or queue not found' },
			],
			examplePath: '/queue/nack/order-processing/msg_abc123',
		},
		{
			id: 'get-queue-head',
			title: 'Get Queue Head',
			sectionTitle: 'Message Operations',
			method: 'GET',
			path: '/queue/head/{name}',
			description: 'Get offset of the oldest message.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON object containing the head offset.',
			responseFields: [{ name: 'offset', type: 'number', description: 'Oldest message offset' }],
			statuses: [
				{ code: 200, description: 'Queue head returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/head/order-processing',
		},
		{
			id: 'get-queue-tail',
			title: 'Get Queue Tail',
			sectionTitle: 'Message Operations',
			method: 'GET',
			path: '/queue/tail/{name}',
			description: 'Get offset of the newest message.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'JSON object containing the tail offset.',
			responseFields: [{ name: 'offset', type: 'number', description: 'Newest message offset' }],
			statuses: [
				{ code: 200, description: 'Queue tail returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/tail/order-processing',
		},
		{
			id: 'create-destination',
			title: 'Create Destination',
			sectionTitle: 'Destinations',
			method: 'POST',
			path: '/queue/destinations/create/{name}',
			description: 'Create an HTTP destination for queue deliveries.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: {
				description: 'Destination creation payload.',
				fields: [
					{
						name: 'destination_type',
						type: 'string',
						description: 'Destination type (`http`)',
						required: true,
					},
					{
						name: 'config',
						type: 'object',
						description: 'Destination config (includes `url`)',
						required: true,
					},
					{
						name: 'retry_attempts',
						type: 'number',
						description: 'Retry attempts override',
						required: false,
					},
					{
						name: 'timeout_seconds',
						type: 'number',
						description: 'Delivery timeout override',
						required: false,
					},
				],
			},
			responseDescription: 'Created destination object.',
			statuses: [
				{ code: 200, description: 'Destination created' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/destinations/create/order-processing',
			exampleBody: {
				destination_type: 'http',
				config: { url: 'https://example.com/webhook' },
				retry_attempts: 5,
				timeout_seconds: 10,
			},
		},
		{
			id: 'list-destinations',
			title: 'List Destinations',
			sectionTitle: 'Destinations',
			method: 'GET',
			path: '/queue/destinations/list/{name}',
			description: 'List queue destinations.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Response containing destination list.',
			responseFields: [
				{ name: 'destinations', type: 'Destination[]', description: 'Configured destinations' },
			],
			statuses: [
				{ code: 200, description: 'Destinations returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/destinations/list/order-processing',
		},
		{
			id: 'update-destination',
			title: 'Update Destination',
			sectionTitle: 'Destinations',
			method: 'PATCH',
			path: '/queue/destinations/update/{name}/{destinationId}',
			description: 'Partially update destination fields.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'destinationId', type: 'string', description: 'Destination ID' },
			],
			queryParams: [],
			requestBody: {
				description: 'Partial destination update payload.',
			},
			responseDescription: 'Updated destination object.',
			statuses: [
				{ code: 200, description: 'Destination updated' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue or destination not found' },
			],
			examplePath: '/queue/destinations/update/order-processing/dst_abc123',
			exampleBody: { timeout_seconds: 20 },
		},
		{
			id: 'delete-destination',
			title: 'Delete Destination',
			sectionTitle: 'Destinations',
			method: 'DELETE',
			path: '/queue/destinations/delete/{name}/{destinationId}',
			description: 'Delete a queue destination.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'destinationId', type: 'string', description: 'Destination ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Destination deleted' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue or destination not found' },
			],
			examplePath: '/queue/destinations/delete/order-processing/dst_abc123',
		},
		{
			id: 'list-delivery-logs',
			title: 'List Delivery Logs',
			sectionTitle: 'Destinations',
			method: 'GET',
			path: '/queue/destinations/deliveries/{name}/{destinationId}',
			description: 'List destination delivery logs with optional status filter.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'destinationId', type: 'string', description: 'Destination ID' },
			],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum logs to return',
					required: false,
				},
				{
					name: 'offset',
					type: 'number',
					description: 'Offset for pagination',
					required: false,
				},
				{
					name: 'status',
					type: 'string',
					description: 'Delivery status filter',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Response containing delivery log entries.',
			responseFields: [
				{ name: 'deliveries', type: 'DeliveryLog[]', description: 'Delivery log entries' },
			],
			statuses: [
				{ code: 200, description: 'Delivery logs returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue or destination not found' },
			],
			examplePath: '/queue/destinations/deliveries/order-processing/dst_abc123?limit=20',
		},
		{
			id: 'list-dlq-messages',
			title: 'List DLQ Messages',
			sectionTitle: 'Dead Letter Queue',
			method: 'GET',
			path: '/queue/dlq/list/{name}',
			description: 'List dead-letter queue messages.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum messages to return',
					required: false,
				},
				{
					name: 'offset',
					type: 'number',
					description: 'Offset for pagination',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Response containing DLQ messages and optional total.',
			responseFields: [
				{ name: 'messages', type: 'DeadLetterMessage[]', description: 'DLQ messages' },
				{
					name: 'total',
					type: 'number',
					description: 'Optional total DLQ message count',
					required: false,
				},
			],
			statuses: [
				{ code: 200, description: 'DLQ messages returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/dlq/list/order-processing?limit=20',
		},
		{
			id: 'replay-dlq-message',
			title: 'Replay DLQ Message',
			sectionTitle: 'Dead Letter Queue',
			method: 'POST',
			path: '/queue/dlq/replay/{name}/{messageId}',
			description: 'Replay a DLQ message back to the queue.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'messageId', type: 'string', description: 'DLQ message ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Replayed message object.',
			statuses: [
				{ code: 200, description: 'DLQ message replayed' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue or message not found' },
			],
			examplePath: '/queue/dlq/replay/order-processing/msg_abc123',
		},
		{
			id: 'purge-dlq',
			title: 'Purge DLQ',
			sectionTitle: 'Dead Letter Queue',
			method: 'DELETE',
			path: '/queue/dlq/purge/{name}',
			description: 'Delete all messages in the dead-letter queue.',
			pathParams: [{ name: 'name', type: 'string', description: 'Queue name' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'DLQ purged' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue not found' },
			],
			examplePath: '/queue/dlq/purge/order-processing',
		},
		{
			id: 'delete-dlq-message',
			title: 'Delete DLQ Message',
			sectionTitle: 'Dead Letter Queue',
			method: 'DELETE',
			path: '/queue/dlq/delete/{name}/{messageId}',
			description: 'Delete a specific message from the dead-letter queue.',
			pathParams: [
				{ name: 'name', type: 'string', description: 'Queue name' },
				{ name: 'messageId', type: 'string', description: 'DLQ message ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'DLQ message deleted' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Queue or message not found' },
			],
			examplePath: '/queue/dlq/delete/order-processing/msg_abc123',
		},
	],
};

const emailService: Service = {
	name: 'Emails',
	slug: 'email',
	description: 'Send and receive emails with managed addresses and webhook destinations',
	endpoints: [
		{
			id: 'create-address',
			title: 'Create Address',
			sectionTitle: 'Address Management',
			method: 'POST',
			path: '/email/addresses',
			description: 'Create a managed address at the `@agentuity.email` domain.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Address creation payload.',
				fields: [
					{
						name: 'local_part',
						type: 'string',
						description: 'Local part before `@agentuity.email`',
						required: true,
					},
				],
			},
			responseDescription: 'Created `EmailAddress` object.',
			statuses: [
				{ code: 200, description: 'Address created' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/addresses',
			exampleBody: { local_part: 'support' },
		},
		{
			id: 'list-addresses',
			title: 'List Addresses',
			sectionTitle: 'Address Management',
			method: 'GET',
			path: '/email/addresses',
			description: 'List managed email addresses.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Array of `EmailAddress` objects.',
			statuses: [
				{ code: 200, description: 'Addresses returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/addresses',
		},
		{
			id: 'get-address',
			title: 'Get Address',
			sectionTitle: 'Address Management',
			method: 'GET',
			path: '/email/addresses/{id}',
			description: 'Get a managed address by ID (`eaddr_...`).',
			pathParams: [{ name: 'id', type: 'string', description: 'Address ID (`eaddr_...`)' }],
			queryParams: [],
			requestBody: null,
			responseDescription: '`EmailAddress` object.',
			statuses: [
				{ code: 200, description: 'Address returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Address not found' },
			],
			examplePath: '/email/addresses/eaddr_abc123',
		},
		{
			id: 'get-connection-config',
			title: 'Get Connection Config',
			sectionTitle: 'Address Management',
			method: 'GET',
			path: '/email/addresses/{id}/connection',
			description: 'Get IMAP/POP3 connection settings and credentials for an address.',
			pathParams: [{ name: 'id', type: 'string', description: 'Address ID' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Connection configuration including IMAP and POP3 details.',
			responseFields: [
				{ name: 'email', type: 'string', description: 'Email address' },
				{ name: 'imap', type: 'object', description: 'IMAP config object' },
				{ name: 'pop3', type: 'object', description: 'POP3 config object' },
			],
			statuses: [
				{ code: 200, description: 'Connection config returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Address not found' },
			],
			examplePath: '/email/addresses/eaddr_abc123/connection',
		},
		{
			id: 'delete-address',
			title: 'Delete Address',
			sectionTitle: 'Address Management',
			method: 'DELETE',
			path: '/email/addresses/{id}',
			description: 'Delete a managed email address.',
			pathParams: [{ name: 'id', type: 'string', description: 'Address ID' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Address deleted' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/addresses/eaddr_abc123',
		},
		{
			id: 'create-email-destination',
			title: 'Create Destination',
			sectionTitle: 'Email Destinations',
			method: 'POST',
			path: '/email/addresses/{addressId}/destinations',
			description: 'Create an inbound webhook destination for an address.',
			pathParams: [{ name: 'addressId', type: 'string', description: 'Address ID' }],
			queryParams: [],
			requestBody: {
				description: 'Destination creation payload.',
				fields: [
					{
						name: 'type',
						type: 'string',
						description: 'Destination type (`url`)',
						required: true,
					},
					{
						name: 'config',
						type: 'object',
						description: 'Destination config including URL',
						required: true,
					},
				],
			},
			responseDescription: 'Created `EmailDestination` object.',
			statuses: [
				{ code: 200, description: 'Destination created' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/addresses/eaddr_abc123/destinations',
			exampleBody: {
				type: 'url',
				config: { url: 'https://example.com/email-hook', method: 'POST' },
			},
		},
		{
			id: 'list-email-destinations',
			title: 'List Destinations',
			sectionTitle: 'Email Destinations',
			method: 'GET',
			path: '/email/addresses/{addressId}/destinations',
			description: 'List inbound destinations for an address.',
			pathParams: [{ name: 'addressId', type: 'string', description: 'Address ID' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Array of `EmailDestination` objects.',
			statuses: [
				{ code: 200, description: 'Destinations returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/addresses/eaddr_abc123/destinations',
		},
		{
			id: 'delete-email-destination',
			title: 'Delete Destination',
			sectionTitle: 'Email Destinations',
			method: 'DELETE',
			path: '/email/addresses/{addressId}/destinations/{destinationId}',
			description: 'Delete an inbound destination.',
			pathParams: [
				{ name: 'addressId', type: 'string', description: 'Address ID' },
				{ name: 'destinationId', type: 'string', description: 'Destination ID' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Destination deleted' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/addresses/eaddr_abc123/destinations/edst_abc123',
		},
		{
			id: 'send-email',
			title: 'Send Email',
			sectionTitle: 'Sending Email',
			method: 'POST',
			path: '/email/outbound/send',
			description:
				'Send an email from an owned address. Delivery is asynchronous and total payload (including attachments) is capped at 25MB.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Outbound email payload.',
				fields: [
					{
						name: 'from',
						type: 'string',
						description: 'Sender address (must be owned)',
						required: true,
					},
					{ name: 'to', type: 'string[]', description: 'Recipients (max 50)', required: true },
					{ name: 'subject', type: 'string', description: 'Email subject', required: true },
					{ name: 'text', type: 'string', description: 'Plain text body', required: false },
					{ name: 'html', type: 'string', description: 'HTML body', required: false },
					{
						name: 'attachments',
						type: 'array',
						description: 'Attachment descriptors',
						required: false,
					},
					{
						name: 'headers',
						type: 'object',
						description: 'Additional outbound headers',
						required: false,
					},
				],
			},
			responseDescription: 'Created `EmailOutbound` object with initial `pending` status.',
			statuses: [
				{ code: 200, description: 'Outbound email accepted' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/outbound/send',
			exampleBody: {
				from: 'support@agentuity.email',
				to: ['user@example.com'],
				subject: 'Welcome!',
				text: 'Thanks for joining Agentuity.',
			},
		},
		{
			id: 'list-inbound',
			title: 'List Inbound',
			sectionTitle: 'Inbound Email',
			method: 'GET',
			path: '/email/inbound',
			description: 'List inbound emails, optionally filtered by address.',
			pathParams: [],
			queryParams: [
				{
					name: 'address_id',
					type: 'string',
					description: 'Filter by address ID',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Array of `EmailInbound` objects.',
			statuses: [
				{ code: 200, description: 'Inbound emails returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/inbound?address_id=eaddr_abc123',
		},
		{
			id: 'get-inbound',
			title: 'Get Inbound',
			sectionTitle: 'Inbound Email',
			method: 'GET',
			path: '/email/inbound/{id}',
			description: 'Get a specific inbound email by ID (`einb_...`).',
			pathParams: [{ name: 'id', type: 'string', description: 'Inbound email ID (`einb_...`)' }],
			queryParams: [],
			requestBody: null,
			responseDescription: '`EmailInbound` object.',
			statuses: [
				{ code: 200, description: 'Inbound email returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Inbound email not found' },
			],
			examplePath: '/email/inbound/einb_abc123',
		},
		{
			id: 'delete-inbound',
			title: 'Delete Inbound',
			sectionTitle: 'Inbound Email',
			method: 'DELETE',
			path: '/email/inbound/{id}',
			description: 'Delete an inbound email record.',
			pathParams: [{ name: 'id', type: 'string', description: 'Inbound email ID' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Inbound email deleted' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/inbound/einb_abc123',
		},
		{
			id: 'list-outbound',
			title: 'List Outbound',
			sectionTitle: 'Outbound Email',
			method: 'GET',
			path: '/email/outbound',
			description: 'List outbound emails, optionally filtered by address.',
			pathParams: [],
			queryParams: [
				{
					name: 'address_id',
					type: 'string',
					description: 'Filter by address ID',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Array of `EmailOutbound` objects.',
			statuses: [
				{ code: 200, description: 'Outbound emails returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/outbound?address_id=eaddr_abc123',
		},
		{
			id: 'get-outbound',
			title: 'Get Outbound',
			sectionTitle: 'Outbound Email',
			method: 'GET',
			path: '/email/outbound/{id}',
			description: 'Get an outbound email by ID (`eout_...`).',
			pathParams: [
				{ name: 'id', type: 'string', description: 'Outbound email ID (`eout_...`)' },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: '`EmailOutbound` object including delivery status and error details.',
			statuses: [
				{ code: 200, description: 'Outbound email returned' },
				{ code: 401, description: 'Unauthorized' },
				{ code: 404, description: 'Outbound email not found' },
			],
			examplePath: '/email/outbound/eout_abc123',
		},
		{
			id: 'delete-outbound',
			title: 'Delete Outbound',
			sectionTitle: 'Outbound Email',
			method: 'DELETE',
			path: '/email/outbound/{id}',
			description: 'Delete an outbound email record.',
			pathParams: [{ name: 'id', type: 'string', description: 'Outbound email ID' }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 200, description: 'Outbound email deleted' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/outbound/eout_abc123',
		},
		{
			id: 'get-email-activity',
			title: 'Get Activity',
			sectionTitle: 'Activity',
			method: 'GET',
			path: '/email/activity/{date}',
			description: 'Get daily inbound/outbound activity over a date window.',
			pathParams: [
				{
					name: 'date',
					type: 'string',
					description: 'Date for activity lookup (YYYY-MM-DD format)',
					required: true,
				},
			],
			queryParams: [
				{
					name: 'days',
					type: 'number',
					description: 'Range in days (7–365, default: 7)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Activity time series grouped by date.',
			responseFields: [
				{ name: 'activity', type: 'array', description: 'Daily activity records' },
				{ name: 'activity[].date', type: 'string', description: 'Date (`YYYY-MM-DD`)' },
				{ name: 'activity[].inbound', type: 'number', description: 'Inbound count for date' },
				{ name: 'activity[].outbound', type: 'number', description: 'Outbound count for date' },
				{ name: 'days', type: 'number', description: 'Applied day range' },
			],
			statuses: [
				{ code: 200, description: 'Activity returned' },
				{ code: 401, description: 'Unauthorized' },
			],
			examplePath: '/email/activity/2026-02-28?days=30',
		},
	],
};

const userService: Service = {
	name: 'Users',
	slug: 'user',
	description: 'Get authenticated user information and organization memberships',
	endpoints: [
		{
			id: 'get-current-user',
			title: 'Get Current User',
			method: 'GET',
			path: '/cli/auth/user',
			description:
				"Retrieve the authenticated user's profile including name and organization memberships.",
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription:
				"Returns the authenticated user's profile including name and organization memberships.",
			responseFields: [
				{ name: 'firstName', type: 'string', description: "User's first name" },
				{ name: 'lastName', type: 'string', description: "User's last name" },
				{
					name: 'organizations',
					type: 'array',
					description: 'List of organizations the user belongs to',
				},
			],
			statuses: [
				{ code: 200, description: 'User profile returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/auth/user',
		},
	],
};

const threadService: Service = {
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

const evaluationsService: Service = {
	name: 'Evaluations',
	slug: 'evaluations',
	description: 'List and retrieve evaluations and their run history',
	endpoints: [
		{
			id: 'list-evaluations',
			title: 'List Evaluations',
			method: 'GET',
			path: '/cli/eval',
			description:
				'List evaluations with optional filtering by organization, project, or agent.',
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
				{ name: 'agentId', type: 'string', description: 'Filter by agent ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Array of evaluation objects.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Evaluation ID' },
				{ name: 'name', type: 'string', description: 'Evaluation name' },
				{ name: 'description', type: 'string', description: 'Evaluation description' },
				{ name: 'identifier', type: 'string', description: 'Unique identifier' },
				{ name: 'agentIdentifier', type: 'string', description: 'Associated agent identifier' },
				{ name: 'projectId', type: 'string', description: 'Project ID' },
				{ name: 'devmode', type: 'boolean', description: 'Whether running in dev mode' },
				{ name: 'createdAt', type: 'string', description: 'Creation timestamp' },
				{ name: 'updatedAt', type: 'string', description: 'Last update timestamp' },
			],
			statuses: [
				{ code: 200, description: 'Evaluations returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/eval',
		},
		{
			id: 'get-evaluation',
			title: 'Get Evaluation',
			method: 'GET',
			path: '/cli/eval/{id}',
			description: 'Get a specific evaluation by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'Evaluation ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Evaluation object.',
			statuses: [
				{ code: 200, description: 'Evaluation returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Evaluation not found' },
			],
			examplePath: '/cli/eval/eval_abc123',
		},
		{
			id: 'list-eval-runs',
			title: 'List Eval Runs',
			sectionTitle: 'Eval Runs',
			method: 'GET',
			path: '/cli/eval-run',
			description: 'List evaluation runs with optional filtering.',
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
				{ name: 'agentId', type: 'string', description: 'Filter by agent ID', required: false },
				{
					name: 'evalId',
					type: 'string',
					description: 'Filter by evaluation ID',
					required: false,
				},
				{
					name: 'sessionId',
					type: 'string',
					description: 'Filter by session ID',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Array of evaluation run objects.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Eval run ID' },
				{ name: 'sessionId', type: 'string', description: 'Session ID' },
				{ name: 'evalId', type: 'string', description: 'Evaluation ID' },
				{ name: 'evalIdentifier', type: 'string', description: 'Evaluation identifier' },
				{ name: 'evalName', type: 'string', description: 'Evaluation name' },
				{ name: 'agentIdentifier', type: 'string', description: 'Agent identifier' },
				{ name: 'projectId', type: 'string', description: 'Project ID' },
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID' },
				{ name: 'devmode', type: 'boolean', description: 'Whether running in dev mode' },
				{ name: 'pending', type: 'boolean', description: 'Whether the run is pending' },
				{ name: 'success', type: 'boolean', description: 'Whether the run succeeded' },
				{ name: 'error', type: 'string', description: 'Error message if failed' },
				{ name: 'result', type: 'object', description: 'Run result data' },
				{ name: 'createdAt', type: 'string', description: 'Creation timestamp' },
				{ name: 'updatedAt', type: 'string', description: 'Last update timestamp' },
			],
			statuses: [
				{ code: 200, description: 'Eval runs returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/eval-run',
		},
		{
			id: 'get-eval-run',
			title: 'Get Eval Run',
			sectionTitle: 'Eval Runs',
			method: 'GET',
			path: '/cli/eval-run/{id}',
			description: 'Get a specific evaluation run by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'Eval run ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Evaluation run object.',
			statuses: [
				{ code: 200, description: 'Eval run returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Eval run not found' },
			],
			examplePath: '/cli/eval-run/er_abc123',
		},
	],
};

const apiKeysService: Service = {
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

const regionService: Service = {
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

const databaseService: Service = {
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
				fields: [
					{
						name: 'query',
						type: 'string',
						description: 'SQL query to execute',
						required: true,
					},
				],
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

const organizationsService: Service = {
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

const machinesService: Service = {
	name: 'Machines',
	slug: 'machines',
	description: 'Manage compute nodes and organization authentication enrollment',
	endpoints: [
		{
			id: 'list-machines',
			title: 'List Machines',
			sectionTitle: 'Machine Management',
			method: 'GET',
			path: '/machine',
			description: 'List all machines visible to the authenticated user.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns all machines visible to the authenticated user.',
			statuses: [
				{ code: 200, description: 'Machines returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/machine',
		},
		{
			id: 'get-machine',
			title: 'Get Machine',
			sectionTitle: 'Machine Management',
			method: 'GET',
			path: '/machine/{machineId}',
			description: 'Get details for a specific machine.',
			pathParams: [
				{ name: 'machineId', type: 'string', description: 'Machine ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns machine details.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Machine ID' },
				{ name: 'instanceId', type: 'string', description: 'Cloud instance ID' },
				{ name: 'status', type: 'string', description: 'Current machine status' },
				{ name: 'provider', type: 'string', description: 'Cloud provider' },
				{ name: 'region', type: 'string', description: 'Deployment region' },
				{ name: 'startedAt', type: 'string', description: 'Start timestamp' },
				{ name: 'stoppedAt', type: 'string', description: 'Stop timestamp' },
				{ name: 'orgId', type: 'string', description: 'Organization ID' },
				{ name: 'orgName', type: 'string', description: 'Organization name' },
				{ name: 'createdAt', type: 'string', description: 'Creation timestamp' },
				{ name: 'metadata', type: 'object', description: 'Machine metadata' },
			],
			statuses: [
				{ code: 200, description: 'Machine returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Machine not found' },
			],
			examplePath: '/machine/mch_abc123',
		},
		{
			id: 'delete-machine',
			title: 'Delete Machine',
			sectionTitle: 'Machine Management',
			method: 'DELETE',
			path: '/machine/{machineId}',
			description: 'Delete a machine by ID.',
			pathParams: [
				{ name: 'machineId', type: 'string', description: 'Machine ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Machine deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Machine not found' },
			],
			examplePath: '/machine/mch_abc123',
		},
		{
			id: 'list-machine-deployments',
			title: 'List Machine Deployments',
			sectionTitle: 'Machine Management',
			method: 'GET',
			path: '/machine/deployments/{machineId}',
			description: 'List all deployments currently running on a specific machine.',
			pathParams: [
				{ name: 'machineId', type: 'string', description: 'Machine ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns all deployments currently running on the specified machine.',
			statuses: [
				{ code: 200, description: 'Deployments returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Machine not found' },
			],
			examplePath: '/machine/deployments/mch_abc123',
		},
		{
			id: 'enroll-organization',
			title: 'Enroll Organization',
			sectionTitle: 'Auth Enrollment',
			method: 'POST',
			path: '/cli/auth/org/enroll',
			description: 'Enroll an organization for machine authentication.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Enrollment payload with organization ID and public key.',
				fields: [
					{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
					{
						name: 'publicKey',
						type: 'string',
						description: 'Public key for machine authentication',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the enrolled organization ID.',
			responseFields: [
				{ name: 'orgId', type: 'string', description: 'The enrolled organization ID' },
			],
			statuses: [
				{ code: 200, description: 'Organization enrolled' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/auth/org/enroll',
			exampleBody: { orgId: 'org_abc123', publicKey: 'ssh-ed25519 AAAA...' },
		},
		{
			id: 'get-enrollment-status',
			title: 'Get Enrollment Status',
			sectionTitle: 'Auth Enrollment',
			method: 'GET',
			path: '/cli/auth/org/status/{orgId}',
			description: 'Get the enrollment status for an organization.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the enrollment status. A null publicKey means not enrolled.',
			responseFields: [
				{
					name: 'publicKey',
					type: 'string | null',
					description: 'Public key or null if not enrolled',
				},
			],
			statuses: [
				{ code: 200, description: 'Enrollment status returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization not found' },
			],
			examplePath: '/cli/auth/org/status/org_abc123',
		},
		{
			id: 'unenroll-organization',
			title: 'Unenroll Organization',
			sectionTitle: 'Auth Enrollment',
			method: 'DELETE',
			path: '/cli/auth/org/unenroll/{orgId}',
			description: 'Remove enrollment for an organization.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Organization unenrolled' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization not found' },
			],
			examplePath: '/cli/auth/org/unenroll/org_abc123',
		},
	],
};

const schedulesService: Service = {
	name: 'Schedules',
	slug: 'schedules',
	description:
		'Create and manage cron-based scheduled jobs with destinations and delivery tracking',
	endpoints: [
		{
			id: 'create-schedule',
			title: 'Create Schedule',
			sectionTitle: 'Schedule Management',
			method: 'POST',
			path: '/schedule/create',
			description: 'Create a new cron-based schedule with optional destinations.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Schedule creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Schedule name', required: true },
					{
						name: 'description',
						type: 'string',
						description: 'Schedule description',
						required: false,
					},
					{
						name: 'expression',
						type: 'string',
						description: 'Cron expression',
						required: true,
					},
					{
						name: 'destinations',
						type: 'array',
						description: "Array of { type: 'url'|'sandbox', config }",
						required: false,
					},
				],
			},
			responseDescription: 'Returns the created schedule and its destinations.',
			responseFields: [
				{ name: 'schedule', type: 'object', description: 'The created schedule' },
				{ name: 'destinations', type: 'array', description: 'Associated destinations' },
			],
			statuses: [
				{ code: 201, description: 'Schedule created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/schedule/create',
			exampleBody: {
				name: 'Daily Report',
				expression: '0 9 * * *',
				destinations: [{ type: 'url', config: { url: 'https://example.com/webhook' } }],
			},
		},
		{
			id: 'list-schedules',
			title: 'List Schedules',
			sectionTitle: 'Schedule Management',
			method: 'GET',
			path: '/schedule/list',
			description: 'List all schedules with optional pagination.',
			pathParams: [],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Max results (max 500)',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of schedules.',
			responseFields: [
				{ name: 'schedules', type: 'array', description: 'List of schedule objects' },
				{ name: 'total', type: 'number', description: 'Total number of schedules' },
			],
			statuses: [
				{ code: 200, description: 'Schedules returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/schedule/list',
		},
		{
			id: 'get-schedule',
			title: 'Get Schedule',
			sectionTitle: 'Schedule Management',
			method: 'GET',
			path: '/schedule/get/{scheduleId}',
			description: 'Get a specific schedule by ID.',
			pathParams: [
				{
					name: 'scheduleId',
					type: 'string',
					description: 'Schedule ID (sch_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the schedule object.',
			statuses: [
				{ code: 200, description: 'Schedule returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/get/sch_abc123',
		},
		{
			id: 'update-schedule',
			title: 'Update Schedule',
			sectionTitle: 'Schedule Management',
			method: 'PUT',
			path: '/schedule/update/{scheduleId}',
			description: "Update a schedule's name, description, or cron expression.",
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Fields to update.',
				fields: [
					{
						name: 'name',
						type: 'string',
						description: 'Updated schedule name',
						required: false,
					},
					{
						name: 'description',
						type: 'string',
						description: 'Updated description',
						required: false,
					},
					{
						name: 'expression',
						type: 'string',
						description: 'Updated cron expression',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the updated schedule.',
			statuses: [
				{ code: 200, description: 'Schedule updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/update/sch_abc123',
			exampleBody: { expression: '0 */6 * * *' },
		},
		{
			id: 'delete-schedule',
			title: 'Delete Schedule',
			sectionTitle: 'Schedule Management',
			method: 'DELETE',
			path: '/schedule/delete/{scheduleId}',
			description: 'Delete a schedule and all associated destinations and delivery history.',
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Deletes the schedule and all associated destinations and delivery history.',
			statuses: [
				{ code: 204, description: 'Schedule deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/delete/sch_abc123',
		},
		{
			id: 'create-schedule-destination',
			title: 'Create Destination',
			sectionTitle: 'Destinations',
			method: 'POST',
			path: '/schedule/destinations/create/{scheduleId}',
			description: 'Add a destination to a schedule.',
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Destination creation payload.',
				fields: [
					{ name: 'type', type: 'string', description: "'url' or 'sandbox'", required: true },
					{
						name: 'config',
						type: 'object',
						description: 'Destination config — for url: { url, headers?, method? }',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the created destination.',
			statuses: [
				{ code: 201, description: 'Destination created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/destinations/create/sch_abc123',
			exampleBody: {
				type: 'url',
				config: { url: 'https://example.com/callback', method: 'POST' },
			},
		},
		{
			id: 'delete-schedule-destination',
			title: 'Delete Destination',
			sectionTitle: 'Destinations',
			method: 'DELETE',
			path: '/schedule/destinations/delete/{destinationId}',
			description: 'Delete a destination from a schedule.',
			pathParams: [
				{
					name: 'destinationId',
					type: 'string',
					description: 'Destination ID (sdst_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Destination deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Destination not found' },
			],
			examplePath: '/schedule/destinations/delete/sdst_abc123',
		},
		{
			id: 'list-schedule-deliveries',
			title: 'List Deliveries',
			sectionTitle: 'Deliveries',
			method: 'GET',
			path: '/schedule/deliveries/{scheduleId}',
			description: 'List delivery attempts for a schedule.',
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns delivery attempts with status, retries, and error details.',
			statuses: [
				{ code: 200, description: 'Deliveries returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/deliveries/sch_abc123',
		},
	],
};

const webhooksService: Service = {
	name: 'Webhooks',
	slug: 'webhooks',
	description: 'Manage webhook endpoints, destinations, receipts, deliveries, and analytics',
	endpoints: [
		{
			id: 'create-webhook',
			title: 'Create Webhook',
			sectionTitle: 'Webhook Management',
			method: 'POST',
			path: '/webhook/create',
			description: 'Create a new webhook endpoint.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Webhook creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Webhook name', required: true },
					{
						name: 'description',
						type: 'string',
						description: 'Webhook description',
						required: false,
					},
				],
			},
			responseDescription:
				'Returns the created webhook. The ingest URL is only returned at creation.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Webhook ID' },
				{ name: 'created_at', type: 'string', description: 'Creation timestamp' },
				{ name: 'updated_at', type: 'string', description: 'Last update timestamp' },
				{ name: 'name', type: 'string', description: 'Webhook name' },
				{ name: 'description', type: 'string', description: 'Webhook description' },
				{ name: 'url', type: 'string', description: 'Ingest URL — only returned at creation' },
				{ name: 'internal', type: 'boolean', description: 'Whether the webhook is internal' },
				{ name: 'metadata', type: 'object', description: 'Webhook metadata' },
			],
			statuses: [
				{ code: 201, description: 'Webhook created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/webhook/create',
			exampleBody: { name: 'Payment Events' },
		},
		{
			id: 'get-webhook',
			title: 'Get Webhook',
			sectionTitle: 'Webhook Management',
			method: 'GET',
			path: '/webhook/get/{webhookId}',
			description: 'Get a specific webhook by ID.',
			pathParams: [
				{
					name: 'webhookId',
					type: 'string',
					description: 'Webhook ID (wh_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the webhook object.',
			statuses: [
				{ code: 200, description: 'Webhook returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook not found' },
			],
			examplePath: '/webhook/get/wh_abc123',
		},
		{
			id: 'list-webhooks',
			title: 'List Webhooks',
			sectionTitle: 'Webhook Management',
			method: 'GET',
			path: '/webhook/list',
			description: 'List all webhooks with optional pagination.',
			pathParams: [],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of webhooks.',
			statuses: [
				{ code: 200, description: 'Webhooks returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/webhook/list',
		},
		{
			id: 'update-webhook',
			title: 'Update Webhook',
			sectionTitle: 'Webhook Management',
			method: 'PUT',
			path: '/webhook/update/{webhookId}',
			description: "Update a webhook's name or description.",
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Webhook update payload.',
				fields: [
					{
						name: 'name',
						type: 'string',
						description: 'Updated webhook name',
						required: true,
					},
					{
						name: 'description',
						type: 'string',
						description: 'Updated description',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the updated webhook.',
			statuses: [
				{ code: 200, description: 'Webhook updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook not found' },
			],
			examplePath: '/webhook/update/wh_abc123',
			exampleBody: { name: 'Updated Webhook' },
		},
		{
			id: 'delete-webhook',
			title: 'Delete Webhook',
			sectionTitle: 'Webhook Management',
			method: 'DELETE',
			path: '/webhook/delete/{webhookId}',
			description: 'Delete a webhook and all associated destinations, receipts, and deliveries.',
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Deletes the webhook and all associated destinations, receipts, and deliveries.',
			statuses: [
				{ code: 204, description: 'Webhook deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook not found' },
			],
			examplePath: '/webhook/delete/wh_abc123',
		},
		{
			id: 'create-webhook-destination',
			title: 'Create Destination',
			sectionTitle: 'Destinations',
			method: 'POST',
			path: '/webhook/destination-create/{webhookId}',
			description: 'Add a destination to a webhook.',
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Destination creation payload.',
				fields: [
					{ name: 'type', type: 'string', description: "'url'", required: true },
					{ name: 'config', type: 'object', description: '{ url, headers? }', required: true },
				],
			},
			responseDescription: 'Returns the created destination.',
			statuses: [
				{ code: 201, description: 'Destination created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook not found' },
			],
			examplePath: '/webhook/destination-create/wh_abc123',
			exampleBody: { type: 'url', config: { url: 'https://example.com/handler' } },
		},
		{
			id: 'list-webhook-destinations',
			title: 'List Destinations',
			sectionTitle: 'Destinations',
			method: 'GET',
			path: '/webhook/destination-list/{webhookId}',
			description: 'List all destinations for a webhook.',
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns list of destinations.',
			statuses: [
				{ code: 200, description: 'Destinations returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook not found' },
			],
			examplePath: '/webhook/destination-list/wh_abc123',
		},
		{
			id: 'update-webhook-destination',
			title: 'Update Destination',
			sectionTitle: 'Destinations',
			method: 'PUT',
			path: '/webhook/destination-update/{webhookId}/{destinationId}',
			description: "Update a destination's configuration.",
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
				{
					name: 'destinationId',
					type: 'string',
					description: 'Destination ID (whds_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: {
				description: 'Destination update payload.',
				fields: [
					{
						name: 'config',
						type: 'object',
						description: 'Updated destination config',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the updated destination.',
			statuses: [
				{ code: 200, description: 'Destination updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook or destination not found' },
			],
			examplePath: '/webhook/destination-update/wh_abc123/whds_def456',
			exampleBody: { config: { url: 'https://example.com/new-handler' } },
		},
		{
			id: 'delete-webhook-destination',
			title: 'Delete Destination',
			sectionTitle: 'Destinations',
			method: 'DELETE',
			path: '/webhook/destination-delete/{webhookId}/{destinationId}',
			description: 'Delete a destination from a webhook.',
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
				{
					name: 'destinationId',
					type: 'string',
					description: 'Destination ID',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Destination deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook or destination not found' },
			],
			examplePath: '/webhook/destination-delete/wh_abc123/whds_def456',
		},
		{
			id: 'list-webhook-receipts',
			title: 'List Receipts',
			sectionTitle: 'Receipts',
			method: 'GET',
			path: '/webhook/receipt-list/{webhookId}',
			description: 'List incoming request records (receipts) for a webhook.',
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
			],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns incoming request records (receipts) for a webhook.',
			statuses: [
				{ code: 200, description: 'Receipts returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook not found' },
			],
			examplePath: '/webhook/receipt-list/wh_abc123',
		},
		{
			id: 'get-webhook-receipt',
			title: 'Get Receipt',
			sectionTitle: 'Receipts',
			method: 'GET',
			path: '/webhook/receipt-get/{webhookId}/{receiptId}',
			description: 'Get a specific receipt by ID.',
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
				{
					name: 'receiptId',
					type: 'string',
					description: 'Receipt ID (whrc_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the receipt with headers and payload.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Receipt ID' },
				{ name: 'date', type: 'string', description: 'Receipt timestamp' },
				{ name: 'webhook_id', type: 'string', description: 'Parent webhook ID' },
				{ name: 'headers', type: 'object', description: 'Request headers' },
				{ name: 'payload', type: 'any', description: 'The received payload' },
			],
			statuses: [
				{ code: 200, description: 'Receipt returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook or receipt not found' },
			],
			examplePath: '/webhook/receipt-get/wh_abc123/whrc_def456',
		},
		{
			id: 'list-webhook-deliveries',
			title: 'List Deliveries',
			sectionTitle: 'Deliveries',
			method: 'GET',
			path: '/webhook/delivery-list/{webhookId}',
			description: 'List delivery attempts for a webhook.',
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
			],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns list of delivery attempts.',
			statuses: [
				{ code: 200, description: 'Deliveries returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook not found' },
			],
			examplePath: '/webhook/delivery-list/wh_abc123',
		},
		{
			id: 'retry-webhook-delivery',
			title: 'Retry Delivery',
			sectionTitle: 'Deliveries',
			method: 'POST',
			path: '/webhook/delivery-retry/{webhookId}/{deliveryId}',
			description:
				"Retry a failed delivery. Only deliveries with 'failed' status can be retried.",
			pathParams: [
				{ name: 'webhookId', type: 'string', description: 'Webhook ID', required: true },
				{
					name: 'deliveryId',
					type: 'string',
					description: 'Delivery ID (whdv_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				"Retries a failed delivery. Only deliveries with 'failed' status can be retried.",
			statuses: [
				{ code: 200, description: 'Delivery retried' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Webhook or delivery not found' },
			],
			examplePath: '/webhook/delivery-retry/wh_abc123/whdv_def456',
			exampleBody: {},
		},
		{
			id: 'get-webhook-org-analytics',
			title: 'Get Org Analytics',
			sectionTitle: 'Analytics',
			method: 'GET',
			path: '/webhook/analytics/org',
			description: 'Get aggregate webhook analytics for the organization.',
			pathParams: [],
			queryParams: [
				{ name: 'start', type: 'string', description: 'ISO 8601 start date', required: false },
				{ name: 'end', type: 'string', description: 'ISO 8601 end date', required: false },
				{
					name: 'granularity',
					type: 'string',
					description: "'minute', 'hour', or 'day'",
					required: false,
				},
			],
			requestBody: null,
			responseDescription:
				'Returns aggregate analytics including total received, delivered, and failed counts.',
			statuses: [
				{ code: 200, description: 'Analytics returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/webhook/analytics/org',
		},
		{
			id: 'get-webhook-org-timeseries',
			title: 'Get Analytics Time Series',
			sectionTitle: 'Analytics',
			method: 'GET',
			path: '/webhook/analytics/org/timeseries',
			description: 'Get time series webhook analytics for the organization.',
			pathParams: [],
			queryParams: [
				{ name: 'start', type: 'string', description: 'ISO 8601 start date', required: false },
				{ name: 'end', type: 'string', description: 'ISO 8601 end date', required: false },
				{
					name: 'granularity',
					type: 'string',
					description: "'minute', 'hour', or 'day'",
					required: false,
				},
			],
			requestBody: null,
			responseDescription:
				'Returns time series data with received, delivered, and failed counts per time bucket.',
			statuses: [
				{ code: 200, description: 'Time series data returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/webhook/analytics/org/timeseries',
		},
	],
};

const sessionsService: Service = {
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
			responseFields: [
				{ name: 'id', type: 'string', description: 'Session ID' },
				{ name: 'start_time', type: 'string', description: 'Session start timestamp' },
				{ name: 'end_time', type: 'string', description: 'Session end timestamp' },
				{ name: 'duration', type: 'number', description: 'Duration in nanoseconds' },
				{ name: 'org_id', type: 'string', description: 'Organization ID' },
				{ name: 'project_id', type: 'string', description: 'Project ID' },
				{ name: 'deployment_id', type: 'string', description: 'Deployment ID' },
				{ name: 'agent_ids', type: 'array', description: 'Agent IDs involved in the session' },
				{ name: 'trigger', type: 'string', description: 'Session trigger type' },
				{ name: 'env', type: 'string', description: 'Environment' },
				{ name: 'devmode', type: 'boolean', description: 'Whether devmode was active' },
				{ name: 'success', type: 'boolean', description: 'Whether the session succeeded' },
				{ name: 'error', type: 'string', description: 'Error message if failed' },
				{ name: 'llm_cost', type: 'number', description: 'LLM cost for the session' },
				{ name: 'total_cost', type: 'number', description: 'Total cost for the session' },
				{ name: 'thread_id', type: 'string', description: 'Associated thread ID' },
			],
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
			responseFields: [
				{ name: 'session', type: 'object', description: 'Full session data' },
				{ name: 'agents', type: 'array', description: 'Agent names and identifiers' },
				{ name: 'eval_runs', type: 'array', description: 'Associated evaluation runs' },
				{ name: 'route', type: 'object', description: 'Route info (id, method, path) or null' },
			],
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
			responseFields: [
				{ name: 'body', type: 'string', description: 'Log message' },
				{ name: 'severity', type: 'string', description: 'Log level' },
				{ name: 'timestamp', type: 'string', description: 'ISO 8601' },
			],
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

const projectsService: Service = {
	name: 'Projects',
	slug: 'projects',
	description:
		'Full project lifecycle management including deployments, agents, environment variables, and hostnames',
	endpoints: [
		{
			id: 'create-project',
			title: 'Create Project',
			sectionTitle: 'Project Management',
			method: 'POST',
			path: '/cli/project',
			description: 'Create a new project within an organization.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Project creation payload.',
				fields: [
					{
						name: 'name',
						type: 'string',
						description: 'Project name (1-255 chars)',
						required: true,
					},
					{
						name: 'description',
						type: 'string',
						description: 'Project description',
						required: false,
					},
					{ name: 'tags', type: 'array', description: 'Project tags', required: false },
					{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
					{
						name: 'cloudRegion',
						type: 'string',
						description: 'Cloud region code',
						required: true,
					},
					{ name: 'domains', type: 'array', description: 'Custom domains', required: false },
				],
			},
			responseDescription: 'Returns the created project ID and SDK key.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Project ID' },
				{ name: 'sdkKey', type: 'string', description: 'SDK key for the new project' },
			],
			statuses: [
				{ code: 201, description: 'Project created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/cli/project',
			exampleBody: { name: 'my-project', orgId: 'org_abc123', cloudRegion: 'usw' },
		},
		{
			id: 'list-projects',
			title: 'List Projects',
			sectionTitle: 'Project Management',
			method: 'GET',
			path: '/cli/project',
			description: 'List all projects accessible to the authenticated user.',
			pathParams: [],
			queryParams: [
				{
					name: 'hasDeployment',
					type: 'boolean',
					description: 'Filter to projects with deployments',
					required: false,
				},
				{
					name: 'limit',
					type: 'number',
					description: 'Max results (default 1000, max 10000)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns a list of projects.',
			statuses: [
				{ code: 200, description: 'Projects returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/cli/project',
		},
		{
			id: 'get-project',
			title: 'Get Project',
			sectionTitle: 'Project Management',
			method: 'GET',
			path: '/cli/project/{id}',
			description:
				'Retrieve a specific project by ID. The `mask` and `includeProjectKeys` query parameters both default to `true` when omitted.',
			pathParams: [{ name: 'id', type: 'string', description: 'Project ID', required: true }],
			queryParams: [
				{
					name: 'mask',
					type: 'boolean',
					description: 'Mask secrets (default true)',
					required: false,
				},
				{
					name: 'includeProjectKeys',
					type: 'boolean',
					description: 'Include SDK keys (default true)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns the project details.',
			statuses: [
				{ code: 200, description: 'Project returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123',
		},
		{
			id: 'delete-projects',
			title: 'Delete Projects',
			sectionTitle: 'Project Management',
			method: 'DELETE',
			path: '/cli/project',
			description: 'Delete one or more projects by ID.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Project deletion payload.',
				fields: [
					{
						name: 'ids',
						type: 'array',
						description: 'Array of project IDs to delete',
						required: true,
					},
				],
			},
			responseDescription: 'Returns array of deleted project IDs.',
			statuses: [
				{ code: 200, description: 'Projects deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/cli/project',
			exampleBody: { ids: ['proj_abc123'] },
		},
		{
			id: 'check-project-exists',
			title: 'Check Project Exists',
			sectionTitle: 'Project Management',
			method: 'GET',
			path: '/cli/project/exists/{name}',
			description: 'Check if a project with the given name already exists.',
			pathParams: [
				{
					name: 'name',
					type: 'string',
					description: 'Project name (URL-encoded)',
					required: true,
				},
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
			],
			requestBody: null,
			responseDescription: 'Returns true (HTTP 409) if exists, false (HTTP 422) if not.',
			statuses: [
				{ code: 409, description: 'Project exists' },
				{ code: 422, description: 'Project does not exist' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/cli/project/exists/my-project?orgId=org_abc123',
		},
		{
			id: 'update-project-region',
			title: 'Update Project Region',
			sectionTitle: 'Project Management',
			method: 'PATCH',
			path: '/cli/project/{id}',
			description: 'Update the cloud region for a project.',
			pathParams: [{ name: 'id', type: 'string', description: 'Project ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Region update payload.',
				fields: [
					{
						name: 'cloudRegion',
						type: 'string',
						description: 'New cloud region',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the updated project.',
			statuses: [
				{ code: 200, description: 'Project updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123',
			exampleBody: { cloudRegion: 'use' },
		},
		{
			id: 'update-env-variables',
			title: 'Update Env Variables',
			sectionTitle: 'Environment Variables',
			method: 'PUT',
			path: '/cli/project/{id}/env',
			description: 'Update environment variables and secrets for a project.',
			pathParams: [{ name: 'id', type: 'string', description: 'Project ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Environment variable update payload.',
				fields: [
					{
						name: 'env',
						type: 'object',
						description: 'Environment variables',
						required: false,
					},
					{ name: 'secrets', type: 'object', description: 'Secret values', required: false },
				],
			},
			responseDescription: 'Returns the updated environment variables.',
			statuses: [
				{ code: 200, description: 'Environment variables updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123/env',
			exampleBody: { env: { DB_HOST: 'localhost' }, secrets: { DB_PASS: 'secret' } },
		},
		{
			id: 'delete-env-variables',
			title: 'Delete Env Variables',
			sectionTitle: 'Environment Variables',
			method: 'DELETE',
			path: '/cli/project/{id}/env',
			description: 'Delete specific environment variables and secrets from a project.',
			pathParams: [{ name: 'id', type: 'string', description: 'Project ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Environment variable deletion payload.',
				fields: [
					{
						name: 'env',
						type: 'array',
						description: 'Env var keys to delete',
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
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Environment variables deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123/env',
			exampleBody: { env: ['OLD_VAR'], secrets: ['OLD_SECRET'] },
		},
		{
			id: 'list-agents',
			title: 'List Agents',
			sectionTitle: 'Agents',
			method: 'GET',
			path: '/cli/agent/{projectId}',
			description: 'List agents for a project.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
			],
			queryParams: [
				{
					name: 'deploymentId',
					type: 'string',
					description: 'Filter by deployment ID',
					required: false,
				},
				{
					name: 'orgId',
					type: 'string',
					description: 'Filter by organization ID',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns a list of agents for the project.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Agent ID' },
				{ name: 'name', type: 'string', description: 'Agent name' },
				{ name: 'description', type: 'string', description: 'Agent description' },
				{ name: 'identifier', type: 'string', description: 'Agent identifier' },
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID' },
				{ name: 'devmode', type: 'boolean', description: 'Whether devmode is active' },
				{ name: 'metadata', type: 'object', description: 'Agent metadata' },
				{ name: 'createdAt', type: 'string', description: 'Creation timestamp' },
				{ name: 'updatedAt', type: 'string', description: 'Last update timestamp' },
				{ name: 'evals', type: 'array', description: 'Associated evaluations' },
			],
			statuses: [
				{ code: 200, description: 'Agents returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/agent/proj_abc123',
		},
		{
			id: 'get-agent-by-identifier',
			title: 'Get Agent by Identifier',
			sectionTitle: 'Agents',
			method: 'GET',
			path: '/cli/agent/{projectId}?identifier={identifier}',
			description: 'Retrieve a specific agent by its identifier.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
			],
			queryParams: [
				{ name: 'identifier', type: 'string', description: 'Agent identifier', required: true },
			],
			requestBody: null,
			responseDescription: 'Returns the agent matching the identifier.',
			statuses: [
				{ code: 200, description: 'Agent returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Agent not found' },
			],
			examplePath: '/cli/agent/proj_abc123?identifier=my-agent',
		},
		{
			id: 'list-deployments',
			title: 'List Deployments',
			sectionTitle: 'Deployments',
			method: 'GET',
			path: '/cli/project/{projectId}/deployments',
			description: 'List deployments for a project.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
			],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Max results (default 10)',
					required: false,
				},
				{
					name: 'orgId',
					type: 'string',
					description: 'Filter by organization ID',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns a list of deployments for the project.',
			statuses: [
				{ code: 200, description: 'Deployments returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123/deployments',
		},
		{
			id: 'get-deployment',
			title: 'Get Deployment',
			sectionTitle: 'Deployments',
			method: 'GET',
			path: '/cli/project/{projectId}/deployments/{deploymentId}',
			description: 'Retrieve a specific deployment by ID.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the deployment details.',
			statuses: [
				{ code: 200, description: 'Deployment returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/project/proj_abc123/deployments/dep_def456',
		},
		{
			id: 'delete-deployment',
			title: 'Delete Deployment',
			sectionTitle: 'Deployments',
			method: 'DELETE',
			path: '/cli/project/{projectId}/deployments/{deploymentId}',
			description: 'Delete a specific deployment.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns confirmation of deletion.',
			statuses: [
				{ code: 200, description: 'Deployment deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/project/proj_abc123/deployments/dep_def456',
		},
		{
			id: 'rollback-deployment',
			title: 'Rollback Deployment',
			sectionTitle: 'Deployments',
			method: 'POST',
			path: '/cli/project/{projectId}/deployments/{deploymentId}/rollback',
			description: 'Rollback to a specific deployment version.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Rolls back to the specified deployment version.',
			statuses: [
				{ code: 200, description: 'Rollback initiated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/project/proj_abc123/deployments/dep_def456/rollback',
		},
		{
			id: 'undeploy-project',
			title: 'Undeploy Project',
			sectionTitle: 'Deployments',
			method: 'POST',
			path: '/cli/project/{projectId}/deployments/undeploy',
			description: 'Undeploy all active deployments for a project.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns confirmation of undeployment.',
			statuses: [
				{ code: 200, description: 'Project undeployed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123/deployments/undeploy',
		},
		{
			id: 'get-deployment-logs',
			title: 'Get Deployment Logs',
			sectionTitle: 'Deployments',
			method: 'GET',
			path: '/cli/project/{projectId}/deployments/{deploymentId}/logs',
			description: 'Retrieve logs for a specific deployment.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Max results (default 100)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns deployment log entries.',
			statuses: [
				{ code: 200, description: 'Logs returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/project/proj_abc123/deployments/dep_def456/logs',
		},
		{
			id: 'get-deployment-info',
			title: 'Get Deployment Info',
			sectionTitle: 'Deployments',
			method: 'GET',
			path: '/cli/deployment/{deploymentId}',
			description:
				'Lightweight deployment lookup — returns ID, project, org, region, state, and active status.',
			pathParams: [
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Lightweight deployment lookup — returns ID, project, org, region, state, and active status.',
			statuses: [
				{ code: 200, description: 'Deployment info returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/deployment/dep_abc123',
		},
		{
			id: 'start-deployment',
			title: 'Start Deployment',
			sectionTitle: 'Deploy Pipeline',
			method: 'POST',
			path: '/cli/deploy/2/start/{projectId}',
			description: 'Start a new deployment for a project.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Deployment configuration payload.',
				fields: [
					{
						name: 'resources',
						type: 'object',
						description: '{ memory?, cpu?, disk? }',
						required: false,
					},
					{
						name: 'mode',
						type: 'object',
						description: "{ type: 'on-demand'|'provisioned', idle? }",
						required: false,
					},
					{
						name: 'dependencies',
						type: 'array',
						description: 'Deployment dependencies',
						required: false,
					},
					{ name: 'domains', type: 'array', description: 'Custom domains', required: false },
				],
			},
			responseDescription: 'Returns deployment details and upload information.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Deployment ID' },
				{ name: 'orgId', type: 'string', description: 'Organization ID' },
				{
					name: 'publicKey',
					type: 'string',
					description: 'For encrypting the deployment archive',
				},
				{
					name: 'buildLogsStreamURL',
					type: 'string',
					description: 'Pulse stream URL for build logs',
				},
			],
			statuses: [
				{ code: 201, description: 'Deployment started' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/deploy/2/start/proj_abc123',
			exampleBody: { resources: { memory: 512, cpu: 1 } },
		},
		{
			id: 'upload-build-metadata',
			title: 'Upload Build Metadata',
			sectionTitle: 'Deploy Pipeline',
			method: 'PUT',
			path: '/cli/deploy/2/start/{deploymentId}',
			description: 'Upload build metadata for a deployment in progress.',
			pathParams: [
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Returns pre-signed upload URLs for the deployment archive and assets.',
			statuses: [
				{ code: 200, description: 'Upload URLs returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/deploy/2/start/dep_abc123',
		},
		{
			id: 'complete-deployment',
			title: 'Complete Deployment',
			sectionTitle: 'Deploy Pipeline',
			method: 'POST',
			path: '/cli/deploy/2/complete/{deploymentId}',
			description: 'Signal that a deployment upload is complete and ready for activation.',
			pathParams: [
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns warmup stream and public URL information.',
			responseFields: [
				{ name: 'streamId', type: 'string', description: 'Warmup logs stream' },
				{
					name: 'publicUrls',
					type: 'object',
					description: '{ latest, deployment, custom[], vanityDeployment?, vanityProject? }',
				},
			],
			statuses: [
				{ code: 200, description: 'Deployment completed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/deploy/2/complete/dep_abc123',
		},
		{
			id: 'get-deploy-status',
			title: 'Get Deploy Status',
			sectionTitle: 'Deploy Pipeline',
			method: 'GET',
			path: '/cli/deploy/2/status/{deploymentId}',
			description: 'Check the current status of a deployment.',
			pathParams: [
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the current deployment state.',
			responseFields: [
				{
					name: 'state',
					type: 'string',
					description:
						'\\`pending\\`, \\`building\\`, \\`deploying\\`, \\`failed\\`, or \\`completed\\`',
				},
			],
			statuses: [
				{ code: 200, description: 'Status returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/deploy/2/status/dep_abc123',
		},
		{
			id: 'report-deploy-failure',
			title: 'Report Deploy Failure',
			sectionTitle: 'Deploy Pipeline',
			method: 'POST',
			path: '/cli/deploy/2/fail/{deploymentId}',
			description: 'Report a deployment failure with error details.',
			pathParams: [
				{ name: 'deploymentId', type: 'string', description: 'Deployment ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Failure report payload.',
				fields: [
					{ name: 'error', type: 'string', description: 'Error message', required: false },
					{
						name: 'diagnostics',
						type: 'object',
						description: 'Diagnostic information',
						required: false,
					},
				],
			},
			responseDescription: 'Returns confirmation of failure report.',
			statuses: [
				{ code: 200, description: 'Failure reported' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Deployment not found' },
			],
			examplePath: '/cli/deploy/2/fail/dep_abc123',
			exampleBody: { error: 'Build failed: TypeScript compilation error' },
		},
		{
			id: 'get-hostname',
			title: 'Get Hostname',
			sectionTitle: 'Hostname',
			method: 'GET',
			path: '/cli/project/{id}/hostname',
			description: 'Get the vanity hostname for a project.',
			pathParams: [{ name: 'id', type: 'string', description: 'Project ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the vanity hostname and URL.',
			responseFields: [
				{ name: 'hostname', type: 'string', description: 'Vanity hostname or null' },
				{ name: 'url', type: 'string', description: 'Full URL or null' },
			],
			statuses: [
				{ code: 200, description: 'Hostname returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123/hostname',
		},
		{
			id: 'set-hostname',
			title: 'Set Hostname',
			sectionTitle: 'Hostname',
			method: 'PUT',
			path: '/cli/project/{id}/hostname',
			description: 'Set a vanity hostname for a project.',
			pathParams: [{ name: 'id', type: 'string', description: 'Project ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Hostname configuration payload.',
				fields: [
					{
						name: 'hostname',
						type: 'string',
						description: 'Desired vanity hostname',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the configured hostname and URL.',
			responseFields: [
				{ name: 'hostname', type: 'string', description: 'Configured hostname' },
				{ name: 'url', type: 'string', description: 'Full URL' },
			],
			statuses: [
				{ code: 200, description: 'Hostname set' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project not found' },
			],
			examplePath: '/cli/project/proj_abc123/hostname',
			exampleBody: { hostname: 'my-app' },
		},
		{
			id: 'check-malware',
			title: 'Check for Malware',
			sectionTitle: 'Security',
			method: 'POST',
			path: '/security/{deploymentId}/malware-check',
			description: 'Scan deployment dependencies for known malware.',
			pathParams: [
				{
					name: 'deploymentId',
					type: 'string',
					description: 'Deployment ID (URL-encoded)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: {
				description: 'Malware scan payload.',
				fields: [
					{ name: 'ecosystem', type: 'string', description: '\\`npm\\`', required: true },
					{
						name: 'packages',
						type: 'array',
						description: 'Array of { name, version }',
						required: true,
					},
				],
			},
			responseDescription:
				"Returns scan results. If action is 'block', the deployment should be blocked.",
			responseFields: [
				{ name: 'action', type: 'string', description: '\\`allow\\` or \\`block\\`' },
				{ name: 'summary', type: 'object', description: '{ scanned, flagged }' },
				{ name: 'findings', type: 'array', description: 'Array of { name, version, reason }' },
			],
			statuses: [
				{ code: 200, description: 'Scan completed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/security/dep_abc123/malware-check',
			exampleBody: { ecosystem: 'npm', packages: [{ name: 'lodash', version: '4.17.21' }] },
		},
	],
};

const tasksService: Service = {
	name: 'Tasks',
	slug: 'tasks',
	description:
		'Full-featured task management with epics, features, bugs, comments, tags, attachments, and activity tracking',
	endpoints: [
		// ── Task Management ──────────────────────────────────────────────
		{
			id: 'create-task',
			title: 'Create Task',
			sectionTitle: 'Task Management',
			method: 'POST',
			path: '/task',
			description: 'Create a new task within the organization.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Task creation payload.',
				fields: [
					{ name: 'title', type: 'string', description: 'Task title', required: true },
					{
						name: 'type',
						type: 'string',
						description: "'epic', 'feature', 'enhancement', 'bug', or 'task'",
						required: true,
					},
					{
						name: 'created_id',
						type: 'string',
						description: 'Creator user ID',
						required: true,
					},
					{
						name: 'description',
						type: 'string',
						description: 'Task description',
						required: false,
					},
					{
						name: 'priority',
						type: 'string',
						description: "'high', 'medium', 'low', or 'none' (default 'none')",
						required: false,
					},
					{
						name: 'status',
						type: 'string',
						description: "'open', 'in_progress', 'done', or 'cancelled' (default 'open')",
						required: false,
					},
					{
						name: 'assigned_id',
						type: 'string',
						description: 'Assigned user ID',
						required: false,
					},
					{
						name: 'parent_id',
						type: 'string',
						description: 'Parent task ID for hierarchy',
						required: false,
					},
					{
						name: 'tag_ids',
						type: 'array',
						description: 'Tag IDs to associate',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the created task.',
			statuses: [
				{ code: 201, description: 'Task created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task',
			exampleBody: {
				title: 'Implement auth flow',
				type: 'feature',
				created_id: 'usr_abc123',
				priority: 'high',
			},
		},
		{
			id: 'get-task',
			title: 'Get Task',
			sectionTitle: 'Task Management',
			method: 'GET',
			path: '/task/{id}',
			description: 'Retrieve a specific task by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the task object.',
			statuses: [
				{ code: 200, description: 'Task returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/tsk_abc123',
		},
		{
			id: 'list-tasks',
			title: 'List Tasks',
			sectionTitle: 'Task Management',
			method: 'GET',
			path: '/task',
			description: 'List tasks with optional filtering, sorting, and pagination.',
			pathParams: [],
			queryParams: [
				{ name: 'status', type: 'string', description: 'Filter by status', required: false },
				{ name: 'type', type: 'string', description: 'Filter by type', required: false },
				{
					name: 'priority',
					type: 'string',
					description: 'Filter by priority',
					required: false,
				},
				{
					name: 'assigned_id',
					type: 'string',
					description: 'Filter by assigned user',
					required: false,
				},
				{
					name: 'created_id',
					type: 'string',
					description: 'Filter by creator',
					required: false,
				},
				{
					name: 'parent_id',
					type: 'string',
					description: 'Filter by parent task',
					required: false,
				},
				{
					name: 'project_id',
					type: 'string',
					description: 'Filter by project',
					required: false,
				},
				{ name: 'tag_id', type: 'string', description: 'Filter by tag', required: false },
				{
					name: 'deleted',
					type: 'boolean',
					description: 'Include soft-deleted tasks',
					required: false,
				},
				{
					name: 'sort',
					type: 'string',
					description: "Field to sort by — prefix with '-' for descending",
					required: false,
				},
				{ name: 'order', type: 'string', description: "'asc' or 'desc'", required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of tasks.',
			responseFields: [
				{ name: 'tasks', type: 'array', description: 'Array of task objects' },
				{ name: 'total', type: 'number', description: 'Total matching tasks' },
				{ name: 'limit', type: 'number', description: 'Limit applied' },
				{ name: 'offset', type: 'number', description: 'Offset applied' },
			],
			statuses: [
				{ code: 200, description: 'Tasks returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task',
		},
		{
			id: 'update-task',
			title: 'Update Task',
			sectionTitle: 'Task Management',
			method: 'PATCH',
			path: '/task/{id}',
			description: 'Update one or more fields on an existing task.',
			pathParams: [{ name: 'id', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Task update payload. All fields are optional.',
				fields: [
					{ name: 'title', type: 'string', description: 'Task title', required: false },
					{
						name: 'description',
						type: 'string',
						description: 'Task description',
						required: false,
					},
					{ name: 'priority', type: 'string', description: 'Task priority', required: false },
					{ name: 'status', type: 'string', description: 'Task status', required: false },
					{ name: 'type', type: 'string', description: 'Task type', required: false },
					{
						name: 'assigned_id',
						type: 'string',
						description: 'Assigned user ID',
						required: false,
					},
					{
						name: 'parent_id',
						type: 'string',
						description: 'Parent task ID',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the updated task.',
			statuses: [
				{ code: 200, description: 'Task updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/tsk_abc123',
			exampleBody: { status: 'in_progress', priority: 'high' },
		},
		{
			id: 'close-task',
			title: 'Close Task',
			sectionTitle: 'Task Management',
			method: 'DELETE',
			path: '/task/{id}',
			description:
				"Sets the task status to 'done' and records the closed date. This does NOT permanently delete the task.",
			pathParams: [{ name: 'id', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription:
				"Sets the task status to 'done' and records the closed date. This does NOT permanently delete the task.",
			statuses: [
				{ code: 200, description: 'Task closed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/tsk_abc123',
		},
		{
			id: 'soft-delete-task',
			title: 'Soft Delete Task',
			sectionTitle: 'Task Management',
			method: 'POST',
			path: '/task/delete/{id}',
			description: 'Marks the task as deleted without permanent removal.',
			pathParams: [{ name: 'id', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Marks the task as deleted without permanent removal.',
			statuses: [
				{ code: 200, description: 'Task soft-deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/delete/tsk_abc123',
		},
		{
			id: 'batch-delete-tasks',
			title: 'Batch Delete Tasks',
			sectionTitle: 'Task Management',
			method: 'POST',
			path: '/task/delete/batch',
			description: 'Soft-delete multiple tasks matching filter criteria.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Batch delete filter payload.',
				fields: [
					{ name: 'status', type: 'string', description: 'Filter by status', required: false },
					{ name: 'type', type: 'string', description: 'Filter by type', required: false },
					{
						name: 'priority',
						type: 'string',
						description: 'Filter by priority',
						required: false,
					},
					{
						name: 'parent_id',
						type: 'string',
						description: 'Filter by parent task',
						required: false,
					},
					{
						name: 'created_id',
						type: 'string',
						description: 'Filter by creator',
						required: false,
					},
					{
						name: 'older_than',
						type: 'string',
						description:
							"Duration string: '30m', '24h', '7d', '2w' (supported units: s, m, h, d, w)",
						required: false,
					},
					{ name: 'limit', type: 'number', description: 'Max 200', required: false },
				],
			},
			responseDescription: 'Returns the list of deleted tasks and count.',
			responseFields: [
				{ name: 'deleted', type: 'array', description: 'Array of { id, title }' },
				{ name: 'count', type: 'number', description: 'Number of tasks deleted' },
			],
			statuses: [
				{ code: 200, description: 'Tasks deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/delete/batch',
			exampleBody: { status: 'cancelled', older_than: '30d', limit: 50 },
		},
		{
			id: 'get-changelog',
			title: 'Get Changelog',
			sectionTitle: 'Task Management',
			method: 'GET',
			path: '/task/changelog/{id}',
			description: 'Get the change history for a specific task.',
			pathParams: [{ name: 'id', type: 'string', description: 'Task ID', required: true }],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the changelog entries for the task.',
			responseFields: [
				{
					name: 'changelog',
					type: 'array',
					description: 'Array of { id, created_at, task_id, field, old_value, new_value }',
				},
				{ name: 'total', type: 'number', description: 'Total changelog entries' },
				{ name: 'limit', type: 'number', description: 'Limit applied' },
				{ name: 'offset', type: 'number', description: 'Offset applied' },
			],
			statuses: [
				{ code: 200, description: 'Changelog returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/changelog/tsk_abc123',
		},
		// ── Comments ─────────────────────────────────────────────────────
		{
			id: 'create-comment',
			title: 'Create Comment',
			sectionTitle: 'Comments',
			method: 'POST',
			path: '/task/comments/create/{taskId}',
			description: 'Add a comment to a task.',
			pathParams: [{ name: 'taskId', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Comment creation payload.',
				fields: [
					{ name: 'body', type: 'string', description: 'Comment text', required: true },
					{ name: 'user_id', type: 'string', description: 'Author user ID', required: true },
				],
			},
			responseDescription: 'Returns the created comment.',
			statuses: [
				{ code: 201, description: 'Comment created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/comments/create/tsk_abc123',
			exampleBody: { body: 'Looks good, ready for review', user_id: 'usr_abc123' },
		},
		{
			id: 'get-comment',
			title: 'Get Comment',
			sectionTitle: 'Comments',
			method: 'GET',
			path: '/task/comments/get/{commentId}',
			description: 'Retrieve a specific comment by ID.',
			pathParams: [
				{ name: 'commentId', type: 'string', description: 'Comment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the comment object.',
			statuses: [
				{ code: 200, description: 'Comment returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Comment not found' },
			],
			examplePath: '/task/comments/get/cmt_abc123',
		},
		{
			id: 'update-comment',
			title: 'Update Comment',
			sectionTitle: 'Comments',
			method: 'PATCH',
			path: '/task/comments/update/{commentId}',
			description: 'Update the body of an existing comment.',
			pathParams: [
				{ name: 'commentId', type: 'string', description: 'Comment ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Comment update payload.',
				fields: [
					{
						name: 'body',
						type: 'string',
						description: 'Updated comment text',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the updated comment.',
			statuses: [
				{ code: 200, description: 'Comment updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Comment not found' },
			],
			examplePath: '/task/comments/update/cmt_abc123',
			exampleBody: { body: 'Updated comment text' },
		},
		{
			id: 'delete-comment',
			title: 'Delete Comment',
			sectionTitle: 'Comments',
			method: 'DELETE',
			path: '/task/comments/delete/{commentId}',
			description: 'Delete a comment.',
			pathParams: [
				{ name: 'commentId', type: 'string', description: 'Comment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Comment deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Comment not found' },
			],
			examplePath: '/task/comments/delete/cmt_abc123',
		},
		{
			id: 'list-comments',
			title: 'List Comments',
			sectionTitle: 'Comments',
			method: 'GET',
			path: '/task/comments/list/{taskId}',
			description: 'List all comments on a task.',
			pathParams: [{ name: 'taskId', type: 'string', description: 'Task ID', required: true }],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of comments.',
			responseFields: [
				{ name: 'comments', type: 'array', description: 'Array of comment objects' },
				{ name: 'total', type: 'number', description: 'Total comments' },
				{ name: 'limit', type: 'number', description: 'Limit applied' },
				{ name: 'offset', type: 'number', description: 'Offset applied' },
			],
			statuses: [
				{ code: 200, description: 'Comments returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/comments/list/tsk_abc123',
		},
		// ── Tags ─────────────────────────────────────────────────────────
		{
			id: 'create-tag',
			title: 'Create Tag',
			sectionTitle: 'Tags',
			method: 'POST',
			path: '/task/tags/create',
			description: 'Create a new tag for organizing tasks.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Tag creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Tag name', required: true },
					{ name: 'color', type: 'string', description: 'Hex color code', required: false },
				],
			},
			responseDescription: 'Returns the created tag.',
			statuses: [
				{ code: 201, description: 'Tag created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/tags/create',
			exampleBody: { name: 'urgent', color: '#ff0000' },
		},
		{
			id: 'get-tag',
			title: 'Get Tag',
			sectionTitle: 'Tags',
			method: 'GET',
			path: '/task/tags/get/{tagId}',
			description: 'Retrieve a specific tag by ID.',
			pathParams: [{ name: 'tagId', type: 'string', description: 'Tag ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the tag object.',
			statuses: [
				{ code: 200, description: 'Tag returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Tag not found' },
			],
			examplePath: '/task/tags/get/tag_abc123',
		},
		{
			id: 'update-tag',
			title: 'Update Tag',
			sectionTitle: 'Tags',
			method: 'PATCH',
			path: '/task/tags/update/{tagId}',
			description: "Update a tag's name or color.",
			pathParams: [{ name: 'tagId', type: 'string', description: 'Tag ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Tag update payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Tag name', required: true },
					{ name: 'color', type: 'string', description: 'Hex color code', required: false },
				],
			},
			responseDescription: 'Returns the updated tag.',
			statuses: [
				{ code: 200, description: 'Tag updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Tag not found' },
			],
			examplePath: '/task/tags/update/tag_abc123',
			exampleBody: { name: 'critical', color: '#cc0000' },
		},
		{
			id: 'delete-tag',
			title: 'Delete Tag',
			sectionTitle: 'Tags',
			method: 'DELETE',
			path: '/task/tags/delete/{tagId}',
			description: 'Delete a tag.',
			pathParams: [{ name: 'tagId', type: 'string', description: 'Tag ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Tag deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Tag not found' },
			],
			examplePath: '/task/tags/delete/tag_abc123',
		},
		{
			id: 'list-tags',
			title: 'List Tags',
			sectionTitle: 'Tags',
			method: 'GET',
			path: '/task/tags/list',
			description: 'List all tags in the organization.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns list of tags.',
			statuses: [
				{ code: 200, description: 'Tags returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/tags/list',
		},
		{
			id: 'add-tag-to-task',
			title: 'Add Tag to Task',
			sectionTitle: 'Tags',
			method: 'POST',
			path: '/task/tags/add/{taskId}/{tagId}',
			description: 'Associate a tag with a task.',
			pathParams: [
				{ name: 'taskId', type: 'string', description: 'Task ID', required: true },
				{ name: 'tagId', type: 'string', description: 'Tag ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns confirmation of the association.',
			statuses: [
				{ code: 200, description: 'Tag added to task' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task or tag not found' },
			],
			examplePath: '/task/tags/add/tsk_abc123/tag_def456',
		},
		{
			id: 'remove-tag-from-task',
			title: 'Remove Tag from Task',
			sectionTitle: 'Tags',
			method: 'DELETE',
			path: '/task/tags/remove/{taskId}/{tagId}',
			description: 'Remove a tag association from a task.',
			pathParams: [
				{ name: 'taskId', type: 'string', description: 'Task ID', required: true },
				{ name: 'tagId', type: 'string', description: 'Tag ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Tag removed from task' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task or tag not found' },
			],
			examplePath: '/task/tags/remove/tsk_abc123/tag_def456',
		},
		{
			id: 'list-task-tags',
			title: 'List Task Tags',
			sectionTitle: 'Tags',
			method: 'GET',
			path: '/task/tags/task/{taskId}',
			description: 'List all tags associated with a specific task.',
			pathParams: [{ name: 'taskId', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns list of tags for the task.',
			statuses: [
				{ code: 200, description: 'Tags returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/tags/task/tsk_abc123',
		},
		// ── Attachments ──────────────────────────────────────────────────
		{
			id: 'request-upload-url',
			title: 'Request Upload URL',
			sectionTitle: 'Attachments',
			method: 'POST',
			path: '/task/attachments/presign-upload/{taskId}',
			description: 'Request a presigned URL for uploading an attachment to a task.',
			pathParams: [{ name: 'taskId', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: {
				description: 'Upload request payload.',
				fields: [
					{ name: 'filename', type: 'string', description: 'File name', required: true },
					{ name: 'content_type', type: 'string', description: 'MIME type', required: false },
					{ name: 'size', type: 'number', description: 'File size in bytes', required: false },
				],
			},
			responseDescription:
				'Returns a presigned upload URL. Upload the file via PUT to the URL, then call confirm.',
			responseFields: [
				{ name: 'attachment', type: 'object', description: 'Attachment metadata' },
				{ name: 'presigned_url', type: 'string', description: 'Upload URL' },
				{
					name: 'expiry_seconds',
					type: 'number',
					description: 'URL expiration time in seconds',
				},
			],
			statuses: [
				{ code: 200, description: 'Presigned URL returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/attachments/presign-upload/tsk_abc123',
			exampleBody: { filename: 'screenshot.png', content_type: 'image/png' },
		},
		{
			id: 'confirm-upload',
			title: 'Confirm Upload',
			sectionTitle: 'Attachments',
			method: 'POST',
			path: '/task/attachments/confirm/{attachmentId}',
			description: 'Confirm that a file was uploaded successfully to the presigned URL.',
			pathParams: [
				{ name: 'attachmentId', type: 'string', description: 'Attachment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Confirms the file was uploaded successfully.',
			statuses: [
				{ code: 200, description: 'Upload confirmed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Attachment not found' },
			],
			examplePath: '/task/attachments/confirm/att_abc123',
		},
		{
			id: 'request-download-url',
			title: 'Request Download URL',
			sectionTitle: 'Attachments',
			method: 'POST',
			path: '/task/attachments/presign-download/{attachmentId}',
			description: 'Request a presigned URL for downloading an attachment.',
			pathParams: [
				{ name: 'attachmentId', type: 'string', description: 'Attachment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns a presigned download URL.',
			responseFields: [
				{ name: 'presigned_url', type: 'string', description: 'Download URL' },
				{
					name: 'expiry_seconds',
					type: 'number',
					description: 'URL expiration time in seconds',
				},
			],
			statuses: [
				{ code: 200, description: 'Presigned URL returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Attachment not found' },
			],
			examplePath: '/task/attachments/presign-download/att_abc123',
		},
		{
			id: 'list-attachments',
			title: 'List Attachments',
			sectionTitle: 'Attachments',
			method: 'GET',
			path: '/task/attachments/list/{taskId}',
			description: 'List all attachments on a task.',
			pathParams: [{ name: 'taskId', type: 'string', description: 'Task ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns list of attachments.',
			responseFields: [
				{ name: 'attachments', type: 'array', description: 'Array of attachment objects' },
				{ name: 'total', type: 'number', description: 'Total attachments' },
			],
			statuses: [
				{ code: 200, description: 'Attachments returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Task not found' },
			],
			examplePath: '/task/attachments/list/tsk_abc123',
		},
		{
			id: 'delete-attachment',
			title: 'Delete Attachment',
			sectionTitle: 'Attachments',
			method: 'DELETE',
			path: '/task/attachments/delete/{attachmentId}',
			description: 'Delete an attachment.',
			pathParams: [
				{ name: 'attachmentId', type: 'string', description: 'Attachment ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Attachment deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Attachment not found' },
			],
			examplePath: '/task/attachments/delete/att_abc123',
		},
		// ── Users & Projects ─────────────────────────────────────────────
		{
			id: 'list-task-users',
			title: 'List Task Users',
			sectionTitle: 'Users & Projects',
			method: 'GET',
			path: '/task/users',
			description: 'List all user entities available for task assignment.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns list of user entities.',
			responseFields: [
				{ name: 'users', type: 'array', description: 'Array of { id, name, type }' },
			],
			statuses: [
				{ code: 200, description: 'Users returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/users',
		},
		{
			id: 'create-task-user',
			title: 'Create User Entity',
			sectionTitle: 'Users & Projects',
			method: 'POST',
			path: '/task/users/create',
			description: 'Create a new user entity for task assignment.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'User entity creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'User name', required: true },
					{ name: 'type', type: 'string', description: "'human' or 'agent'", required: false },
				],
			},
			responseDescription: 'Returns the created user entity.',
			statuses: [
				{ code: 201, description: 'User entity created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/users/create',
			exampleBody: { name: 'Alice', type: 'human' },
		},
		{
			id: 'get-task-user',
			title: 'Get User Entity',
			sectionTitle: 'Users & Projects',
			method: 'GET',
			path: '/task/users/get/{userId}',
			description: 'Retrieve a specific user entity by ID.',
			pathParams: [
				{ name: 'userId', type: 'string', description: 'User entity ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the user entity object.',
			statuses: [
				{ code: 200, description: 'User entity returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'User entity not found' },
			],
			examplePath: '/task/users/get/usr_abc123',
		},
		{
			id: 'delete-task-user',
			title: 'Delete User Entity',
			sectionTitle: 'Users & Projects',
			method: 'DELETE',
			path: '/task/users/delete/{userId}',
			description: 'Delete a user entity.',
			pathParams: [
				{ name: 'userId', type: 'string', description: 'User entity ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'User entity deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'User entity not found' },
			],
			examplePath: '/task/users/delete/usr_abc123',
		},
		{
			id: 'list-task-projects',
			title: 'List Task Projects',
			sectionTitle: 'Users & Projects',
			method: 'GET',
			path: '/task/projects',
			description: 'List all project entities available for task organization.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns list of project entities.',
			responseFields: [
				{ name: 'projects', type: 'array', description: 'Array of { id, name }' },
			],
			statuses: [
				{ code: 200, description: 'Projects returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/projects',
		},
		{
			id: 'create-task-project',
			title: 'Create Project Entity',
			sectionTitle: 'Users & Projects',
			method: 'POST',
			path: '/task/projects/create',
			description: 'Create a new project entity for task organization.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Project entity creation payload.',
				fields: [{ name: 'name', type: 'string', description: 'Project name', required: true }],
			},
			responseDescription: 'Returns the created project entity.',
			statuses: [
				{ code: 201, description: 'Project entity created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/projects/create',
			exampleBody: { name: 'Backend Rewrite' },
		},
		{
			id: 'get-task-project',
			title: 'Get Project Entity',
			sectionTitle: 'Users & Projects',
			method: 'GET',
			path: '/task/projects/get/{projectId}',
			description: 'Retrieve a specific project entity by ID.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project entity ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the project entity object.',
			statuses: [
				{ code: 200, description: 'Project entity returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project entity not found' },
			],
			examplePath: '/task/projects/get/tprj_abc123',
		},
		{
			id: 'delete-task-project',
			title: 'Delete Project Entity',
			sectionTitle: 'Users & Projects',
			method: 'DELETE',
			path: '/task/projects/delete/{projectId}',
			description: 'Delete a project entity.',
			pathParams: [
				{ name: 'projectId', type: 'string', description: 'Project entity ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Project entity deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Project entity not found' },
			],
			examplePath: '/task/projects/delete/tprj_abc123',
		},
		// ── Activity ─────────────────────────────────────────────────────
		{
			id: 'get-activity-timeline',
			title: 'Get Activity Timeline',
			sectionTitle: 'Activity',
			method: 'GET',
			path: '/task/activity/{date}',
			description: 'Get daily activity counts grouped by status over a configurable time range.',
			pathParams: [
				{
					name: 'date',
					type: 'string',
					description: 'Date for activity lookup (YYYY-MM-DD format)',
					required: true,
				},
			],
			queryParams: [
				{
					name: 'days',
					type: 'number',
					description: 'Number of days (min 7, max 365, default 90)',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns daily activity counts grouped by status.',
			responseFields: [
				{
					name: 'activity',
					type: 'array',
					description: 'Array of { date, open, inProgress, done, cancelled }',
				},
				{ name: 'days', type: 'number', description: 'Number of days in the response' },
			],
			statuses: [
				{ code: 200, description: 'Activity timeline returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/task/activity/2026-02-28',
		},
	],
};

const sandboxesService: Service = {
	name: 'Sandboxes',
	slug: 'sandboxes',
	description:
		'Create and manage isolated execution environments with full lifecycle, file system, snapshot, and checkpoint support',
	hasPublicEndpoints: true,
	endpoints: [
		// ── Sandbox Management ────────────────────────────────────────────
		{
			id: 'create-sandbox',
			title: 'Create Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'POST',
			path: '/sandbox',
			description: 'Create a new sandbox execution environment.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Sandbox creation payload.',
				fields: [
					{ name: 'projectId', type: 'string', description: 'Project ID', required: false },
					{
						name: 'runtime',
						type: 'string',
						description: 'Runtime identifier',
						required: false,
					},
					{ name: 'name', type: 'string', description: 'Sandbox name', required: false },
					{
						name: 'description',
						type: 'string',
						description: 'Sandbox description',
						required: false,
					},
					{
						name: 'resources',
						type: 'object',
						description: '{ memory?, cpu?, disk? }',
						required: false,
					},
					{
						name: 'env',
						type: 'object',
						description: 'Environment variables',
						required: false,
					},
					{
						name: 'network',
						type: 'object',
						description: '{ enabled?, port? (1024-65535) }',
						required: false,
					},
					{
						name: 'timeout',
						type: 'object',
						description: '{ idle?, execution? }',
						required: false,
					},
					{
						name: 'command',
						type: 'object',
						description: "{ exec: string[], files?, mode?: 'oneshot'|'interactive' }",
						required: false,
					},
					{
						name: 'files',
						type: 'array',
						description: 'Array of { path, content (base64) }',
						required: false,
					},
					{
						name: 'snapshot',
						type: 'string',
						description: 'Snapshot ID to restore from',
						required: false,
					},
					{
						name: 'metadata',
						type: 'object',
						description: 'Arbitrary metadata',
						required: false,
					},
				],
			},
			responseDescription:
				'Returns the sandbox ID, status, and optional stream URLs for stdout/stderr.',
			responseFields: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID' },
				{
					name: 'status',
					type: 'string',
					description: "'creating', 'idle', 'running', 'paused', etc.",
				},
				{ name: 'stdoutStreamUrl', type: 'string', description: 'Pulse stream URL for stdout' },
				{ name: 'stderrStreamUrl', type: 'string', description: 'Pulse stream URL for stderr' },
			],
			statuses: [
				{ code: 201, description: 'Sandbox created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox',
			exampleBody: {
				name: 'dev-sandbox',
				runtime: 'node-20',
				resources: { memory: 512 },
				env: { NODE_ENV: 'development' },
			},
		},
		{
			id: 'list-sandboxes',
			title: 'List Sandboxes',
			sectionTitle: 'Sandbox Management',
			method: 'GET',
			path: '/sandbox',
			description: 'List sandboxes with optional filtering and pagination.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{ name: 'name', type: 'string', description: 'Filter by name', required: false },
				{ name: 'mode', type: 'string', description: 'Filter by mode', required: false },
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project',
					required: false,
				},
				{ name: 'status', type: 'string', description: 'Filter by status', required: false },
				{
					name: 'live',
					type: 'boolean',
					description: 'Only running sandboxes',
					required: false,
				},
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
				{
					name: 'deletedOnly',
					type: 'boolean',
					description: 'Only deleted sandboxes',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of sandboxes.',
			responseFields: [
				{ name: 'sandboxes', type: 'array', description: 'Array of sandbox objects' },
				{ name: 'total', type: 'number', description: 'Total matching sandboxes' },
			],
			statuses: [
				{ code: 200, description: 'Sandboxes returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox',
		},
		{
			id: 'get-sandbox',
			title: 'Get Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'GET',
			path: '/sandbox/{sandboxId}',
			description: 'Retrieve a specific sandbox by ID.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'includeDeleted',
					type: 'boolean',
					description: 'Include deleted sandboxes',
					required: false,
				},
			],
			requestBody: null,
			responseDescription:
				'Returns full sandbox details including resources, runtime, network, timeout, and usage metrics.',
			statuses: [
				{ code: 200, description: 'Sandbox returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123',
		},
		{
			id: 'destroy-sandbox',
			title: 'Destroy Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'DELETE',
			path: '/sandbox/{sandboxId}',
			description: 'Destroy a sandbox and release all resources.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Destroys the sandbox and releases all resources.',
			statuses: [
				{ code: 200, description: 'Sandbox destroyed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123',
		},
		{
			id: 'get-sandbox-status',
			title: 'Get Sandbox Status',
			sectionTitle: 'Sandbox Management',
			method: 'GET',
			path: '/sandbox/status/{sandboxId}',
			description: 'Lightweight status check backed by Redis (~1ms). Optimized for polling.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the sandbox status.',
			responseFields: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID' },
				{ name: 'status', type: 'string', description: 'Current sandbox status' },
				{ name: 'exitCode', type: 'number', description: 'Exit code if terminated' },
			],
			statuses: [
				{ code: 200, description: 'Status returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/status/sbx_abc123',
		},
		{
			id: 'pause-sandbox',
			title: 'Pause Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'POST',
			path: '/sandbox/{sandboxId}/pause',
			description: 'Pause a running sandbox and create a checkpoint.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Pauses the sandbox and creates a checkpoint.',
			statuses: [
				{ code: 200, description: 'Sandbox paused' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123/pause',
		},
		{
			id: 'resume-sandbox',
			title: 'Resume Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'POST',
			path: '/sandbox/{sandboxId}/resume',
			description: 'Resume a paused sandbox from its checkpoint.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Resumes a paused sandbox from its checkpoint.',
			statuses: [
				{ code: 200, description: 'Sandbox resumed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123/resume',
		},
		{
			id: 'update-sandbox-env',
			title: 'Update Environment',
			sectionTitle: 'Sandbox Management',
			method: 'PATCH',
			path: '/sandbox/env/{sandboxId}',
			description:
				'Update environment variables for a sandbox. Set a value to null to delete a variable.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Environment variable updates.',
				fields: [
					{
						name: 'env',
						type: 'object',
						description: 'Key-value pairs. Set value to null to delete a variable.',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the current environment after update.',
			responseFields: [
				{ name: 'env', type: 'object', description: 'Current environment after update' },
			],
			statuses: [
				{ code: 200, description: 'Environment updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/env/sbx_abc123',
			exampleBody: { env: { NODE_ENV: 'production', OLD_VAR: null } },
		},
		// ── Execution ─────────────────────────────────────────────────────
		{
			id: 'execute-command',
			title: 'Execute Command',
			sectionTitle: 'Execution',
			method: 'POST',
			path: '/sandbox/{sandboxId}/execute',
			description: 'Execute a command in a sandbox.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Command execution payload.',
				fields: [
					{
						name: 'command',
						type: 'array',
						description: 'Command and arguments',
						required: true,
					},
					{
						name: 'files',
						type: 'array',
						description: 'Files to write before execution',
						required: false,
					},
					{
						name: 'timeout',
						type: 'string',
						description: 'Execution timeout',
						required: false,
					},
					{
						name: 'stream',
						type: 'object',
						description: '{ stdout?, stderr?, timestamps? }',
						required: false,
					},
				],
			},
			responseDescription:
				'Returns execution ID and stream URLs. Returns 409 if sandbox is busy.',
			responseFields: [
				{ name: 'executionId', type: 'string', description: 'Execution ID' },
				{
					name: 'status',
					type: 'string',
					description: "'queued', 'running', 'completed', 'failed', 'timeout', or 'cancelled'",
				},
				{ name: 'exitCode', type: 'number', description: 'Exit code if completed' },
				{
					name: 'durationMs',
					type: 'number',
					description: 'Execution duration in milliseconds',
				},
				{ name: 'stdoutStreamUrl', type: 'string', description: 'Pulse stream URL for stdout' },
				{ name: 'stderrStreamUrl', type: 'string', description: 'Pulse stream URL for stderr' },
			],
			statuses: [
				{ code: 200, description: 'Command executed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
				{ code: 409, description: 'Conflict — sandbox is busy with another execution' },
			],
			examplePath: '/sandbox/sbx_abc123/execute',
			exampleBody: { command: ['node', '-e', "console.log('hello')"] },
		},
		{
			id: 'get-execution',
			title: 'Get Execution',
			sectionTitle: 'Execution',
			method: 'GET',
			path: '/sandbox/execution/{executionId}',
			description: 'Retrieve execution details. Use the `wait` parameter for long-polling.',
			pathParams: [
				{ name: 'executionId', type: 'string', description: 'Execution ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'wait',
					type: 'string',
					description:
						"Long-poll duration (e.g., '60s', '5m'). Server holds connection until execution completes or timeout.",
					required: false,
				},
			],
			requestBody: null,
			responseDescription:
				'Returns execution details. Use the `wait` parameter for long-polling.',
			statuses: [
				{ code: 200, description: 'Execution returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Execution not found' },
			],
			examplePath: '/sandbox/execution/exec_abc123',
		},
		{
			id: 'list-executions',
			title: 'List Executions',
			sectionTitle: 'Execution',
			method: 'GET',
			path: '/sandbox/sandboxes/{sandboxId}/executions',
			description: 'List executions for a specific sandbox.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns list of executions for the sandbox.',
			statuses: [
				{ code: 200, description: 'Executions returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sandboxes/sbx_abc123/executions',
		},
		// ── File System ───────────────────────────────────────────────────
		{
			id: 'write-files',
			title: 'Write Files',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/{sandboxId}',
			description: 'Write one or more files to the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Files to write.',
				fields: [
					{
						name: 'files',
						type: 'array',
						description: 'Array of { path, content (base64-encoded) }',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the number of files written.',
			responseFields: [
				{ name: 'filesWritten', type: 'number', description: 'Number of files written' },
			],
			statuses: [
				{ code: 200, description: 'Files written' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/sbx_abc123',
			exampleBody: {
				files: [{ path: '/app/index.js', content: 'Y29uc29sZS5sb2coJ2hlbGxvJyk=' }],
			},
		},
		{
			id: 'read-file',
			title: 'Read File',
			sectionTitle: 'File System',
			method: 'GET',
			path: '/fs/{sandboxId}',
			description: 'Read a file from the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'File path to read', required: true },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the raw file contents as a stream.',
			statuses: [
				{ code: 200, description: 'File contents returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox or file not found' },
			],
			examplePath: '/fs/sbx_abc123?path=/home/user/file.txt',
		},
		{
			id: 'create-directory',
			title: 'Create Directory',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/mkdir/{sandboxId}',
			description: 'Create a directory in the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Directory creation payload.',
				fields: [
					{ name: 'path', type: 'string', description: 'Directory path', required: true },
					{
						name: 'recursive',
						type: 'boolean',
						description: 'Create parent directories',
						required: false,
					},
				],
			},
			responseDescription: 'Directory created successfully.',
			statuses: [
				{ code: 200, description: 'Directory created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/mkdir/sbx_abc123',
			exampleBody: { path: '/app/src', recursive: true },
		},
		{
			id: 'remove-directory',
			title: 'Remove Directory',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/rmdir/{sandboxId}',
			description: 'Remove a directory from the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Directory removal payload.',
				fields: [
					{ name: 'path', type: 'string', description: 'Directory path', required: true },
					{
						name: 'recursive',
						type: 'boolean',
						description: 'Remove recursively',
						required: false,
					},
				],
			},
			responseDescription: 'Directory removed successfully.',
			statuses: [
				{ code: 200, description: 'Directory removed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/rmdir/sbx_abc123',
			exampleBody: { path: '/app/tmp', recursive: true },
		},
		{
			id: 'remove-file',
			title: 'Remove File',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/rm/{sandboxId}',
			description: 'Remove a file from the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'File removal payload.',
				fields: [{ name: 'path', type: 'string', description: 'File path', required: true }],
			},
			responseDescription: 'File removed successfully.',
			statuses: [
				{ code: 200, description: 'File removed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/rm/sbx_abc123',
			exampleBody: { path: '/app/old-file.js' },
		},
		{
			id: 'list-files',
			title: 'List Files',
			sectionTitle: 'File System',
			method: 'GET',
			path: '/fs/list/{sandboxId}',
			description: 'List files in a sandbox directory.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'Directory to list', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns list of files in the directory.',
			responseFields: [
				{
					name: 'files',
					type: 'array',
					description: 'Array of { path, size, isDir, mode, modTime }',
				},
			],
			statuses: [
				{ code: 200, description: 'Files listed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/list/sbx_abc123',
		},
		{
			id: 'download-archive',
			title: 'Download Archive',
			sectionTitle: 'File System',
			method: 'GET',
			path: '/fs/download/{sandboxId}',
			description: 'Download a compressed archive of the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'Directory to archive', required: false },
				{ name: 'format', type: 'string', description: "'zip' or 'tar.gz'", required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns a streaming archive of the sandbox filesystem.',
			statuses: [
				{ code: 200, description: 'Archive returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/download/sbx_abc123',
		},
		{
			id: 'upload-archive',
			title: 'Upload Archive',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/upload/{sandboxId}',
			description:
				'Upload and extract a compressed archive to the sandbox. Send raw binary with Content-Type: application/octet-stream.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'Target directory', required: false },
				{ name: 'format', type: 'string', description: 'Archive format', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription:
				'Uploads and extracts a compressed archive to the sandbox. Send raw binary with Content-Type: application/octet-stream.',
			statuses: [
				{ code: 200, description: 'Archive uploaded and extracted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/upload/sbx_abc123',
			exampleHeaders: { 'Content-Type': 'application/octet-stream' },
			exampleBody: '<binary archive data>',
		},
		// ── Snapshots ─────────────────────────────────────────────────────
		{
			id: 'create-snapshot',
			title: 'Create Snapshot',
			sectionTitle: 'Snapshots',
			method: 'POST',
			path: '/sandbox/{sandboxId}/snapshot',
			description: 'Create a snapshot of the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Snapshot creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Snapshot name', required: false },
					{
						name: 'description',
						type: 'string',
						description: 'Snapshot description',
						required: false,
					},
					{ name: 'tag', type: 'string', description: 'Snapshot tag', required: false },
					{
						name: 'public',
						type: 'boolean',
						description: 'Make snapshot publicly accessible',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the created snapshot.',
			statuses: [
				{ code: 201, description: 'Snapshot created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123/snapshot',
			exampleBody: { name: 'baseline', tag: 'v1.0' },
		},
		{
			id: 'get-snapshot',
			title: 'Get Snapshot',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/{snapshotId}',
			description: 'Retrieve a specific snapshot by ID.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the snapshot object.',
			statuses: [
				{ code: 200, description: 'Snapshot returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123',
		},
		{
			id: 'list-snapshots',
			title: 'List Snapshots',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots',
			description: 'List snapshots with optional filtering and pagination.',
			pathParams: [],
			queryParams: [
				{
					name: 'sandboxId',
					type: 'string',
					description: 'Filter by sandbox',
					required: false,
				},
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of snapshots.',
			responseFields: [
				{ name: 'snapshots', type: 'array', description: 'Array of snapshot objects' },
				{ name: 'total', type: 'number', description: 'Total matching snapshots' },
			],
			statuses: [
				{ code: 200, description: 'Snapshots returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/snapshots',
		},
		{
			id: 'delete-snapshot',
			title: 'Delete Snapshot',
			sectionTitle: 'Snapshots',
			method: 'DELETE',
			path: '/sandbox/snapshots/{snapshotId}',
			description: 'Delete a snapshot.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Snapshot deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123',
		},
		{
			id: 'update-snapshot-tag',
			title: 'Update Snapshot Tag',
			sectionTitle: 'Snapshots',
			method: 'PATCH',
			path: '/sandbox/snapshots/{snapshotId}',
			description: 'Update the tag on a snapshot.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Tag update payload.',
				fields: [
					{
						name: 'tag',
						type: 'string',
						description: 'New tag or null to remove tag',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the updated snapshot.',
			statuses: [
				{ code: 200, description: 'Snapshot tag updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123',
			exampleBody: { tag: 'v2.0' },
		},
		{
			id: 'get-snapshot-lineage',
			title: 'Get Snapshot Lineage',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/lineage',
			description: 'Get the ordered ancestry chain from a specified snapshot to root.',
			pathParams: [],
			queryParams: [
				{
					name: 'snapshot',
					type: 'string',
					description: 'Snapshot ID or name:tag',
					required: false,
				},
				{ name: 'name', type: 'string', description: 'Snapshot name', required: false },
				{ name: 'tag', type: 'string', description: 'Snapshot tag', required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns ordered ancestry chain from specified snapshot to root.',
			statuses: [
				{ code: 200, description: 'Lineage returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/snapshots/lineage',
		},
		{
			id: 'get-public-snapshot',
			title: 'Get Public Snapshot',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/public/{snapshotRef}',
			description:
				'Retrieve a public snapshot by ID, full name (@slug/name:tag), or name:tag. No authentication required.',
			pathParams: [
				{
					name: 'snapshotRef',
					type: 'string',
					description: 'Snapshot ID, full name (@slug/name:tag), or name:tag',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns public snapshot details. No authentication required.',
			statuses: [
				{ code: 200, description: 'Public snapshot returned' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/public/snp_abc123',
		},
		{
			id: 'list-public-snapshots',
			title: 'List Public Snapshots',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/public',
			description: 'List publicly available snapshots.',
			pathParams: [],
			queryParams: [
				{ name: 'limit', type: 'number', description: 'Max 100', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of public snapshots.',
			responseFields: [
				{ name: 'snapshots', type: 'array', description: 'Array of public snapshot objects' },
				{ name: 'total', type: 'number', description: 'Total public snapshots' },
			],
			statuses: [{ code: 200, description: 'Public snapshots returned' }],
			examplePath: '/sandbox/snapshots/public',
		},
		{
			id: 'initialize-snapshot-build',
			title: 'Initialize Snapshot Build',
			sectionTitle: 'Snapshots',
			method: 'POST',
			path: '/sandbox/snapshots/build',
			description:
				'Initialize a snapshot build. Returns a presigned upload URL for the snapshot archive.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Snapshot build initialization payload.',
				fields: [
					{
						name: 'runtime',
						type: 'string',
						description: 'Runtime identifier',
						required: true,
					},
					{ name: 'name', type: 'string', description: 'Snapshot name', required: false },
					{ name: 'tag', type: 'string', description: 'Snapshot tag', required: false },
					{
						name: 'description',
						type: 'string',
						description: 'Snapshot description',
						required: false,
					},
					{
						name: 'contentHash',
						type: 'string',
						description: 'For deduplication',
						required: false,
					},
					{ name: 'force', type: 'boolean', description: 'Force rebuild', required: false },
					{
						name: 'encrypt',
						type: 'boolean',
						description: 'Encrypt snapshot',
						required: false,
					},
					{
						name: 'public',
						type: 'boolean',
						description: 'Make snapshot public',
						required: false,
					},
				],
			},
			responseDescription:
				'Returns snapshot ID and presigned upload URL. If unchanged is true, content matches existing snapshot.',
			responseFields: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID' },
				{ name: 'uploadUrl', type: 'string', description: 'Presigned S3 upload URL' },
				{
					name: 'unchanged',
					type: 'boolean',
					description: 'True if content hash matches existing snapshot',
				},
				{
					name: 'existingId',
					type: 'string',
					description: 'Existing snapshot ID if unchanged',
				},
			],
			statuses: [
				{ code: 200, description: 'Build initialized' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/snapshots/build',
			exampleBody: { runtime: 'node-20', name: 'my-app', tag: 'latest' },
		},
		{
			id: 'finalize-snapshot-build',
			title: 'Finalize Snapshot Build',
			sectionTitle: 'Snapshots',
			method: 'POST',
			path: '/sandbox/snapshots/{snapshotId}/finalize',
			description: 'Finalize a snapshot build after uploading the archive.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Snapshot finalization payload.',
				fields: [
					{
						name: 'sizeBytes',
						type: 'number',
						description: 'Archive size in bytes',
						required: true,
					},
					{
						name: 'fileCount',
						type: 'number',
						description: 'Number of files',
						required: true,
					},
					{
						name: 'files',
						type: 'array',
						description: 'Array of file metadata',
						required: true,
					},
					{
						name: 'dependencies',
						type: 'array',
						description: 'Dependency list',
						required: false,
					},
					{ name: 'packages', type: 'array', description: 'Package list', required: false },
					{
						name: 'env',
						type: 'object',
						description: 'Environment variables',
						required: false,
					},
					{
						name: 'metadata',
						type: 'object',
						description: 'Arbitrary metadata',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the finalized snapshot.',
			statuses: [
				{ code: 200, description: 'Snapshot finalized' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123/finalize',
			exampleBody: {
				sizeBytes: 1048576,
				fileCount: 42,
				files: [{ path: '/app/index.js', size: 1024 }],
			},
		},
		{
			id: 'upload-public-snapshot',
			title: 'Upload Public Snapshot',
			sectionTitle: 'Snapshots',
			method: 'PUT',
			path: '/sandbox/snapshots/{snapshotId}/upload',
			description:
				'Upload a gzip archive for public snapshots. Content-Type must be application/gzip. Includes virus scanning.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription:
				'Uploads a gzip archive for public snapshots. Content-Type must be application/gzip. Includes virus scanning.',
			statuses: [
				{ code: 200, description: 'Snapshot uploaded' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123/upload',
			exampleHeaders: { 'Content-Type': 'application/gzip' },
			exampleBody: '<binary gzip data>',
		},
		// ── Disk Checkpoints ──────────────────────────────────────────────
		{
			id: 'create-checkpoint',
			title: 'Create Checkpoint',
			sectionTitle: 'Disk Checkpoints',
			method: 'POST',
			path: '/sandbox/{sandboxId}/checkpoint',
			description: 'Create a named checkpoint of the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Checkpoint creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Checkpoint name', required: true },
				],
			},
			responseDescription: 'Returns the created checkpoint.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Checkpoint ID (ckpt_ prefix)' },
				{ name: 'name', type: 'string', description: 'Checkpoint name' },
				{ name: 'createdAt', type: 'string', description: 'Creation timestamp' },
				{ name: 'parent', type: 'string', description: 'Parent checkpoint ID' },
			],
			statuses: [
				{ code: 201, description: 'Checkpoint created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123/checkpoint',
			exampleBody: { name: 'before-migration' },
		},
		{
			id: 'list-checkpoints',
			title: 'List Checkpoints',
			sectionTitle: 'Disk Checkpoints',
			method: 'GET',
			path: '/sandbox/checkpoints/{sandboxId}',
			description: 'List checkpoints for a specific sandbox.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns list of checkpoints for the sandbox.',
			statuses: [
				{ code: 200, description: 'Checkpoints returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/checkpoints/sbx_abc123',
		},
		{
			id: 'restore-checkpoint',
			title: 'Restore Checkpoint',
			sectionTitle: 'Disk Checkpoints',
			method: 'POST',
			path: '/sandbox/{sandboxId}/checkpoint/{checkpointId}/restore',
			description: 'Restore the sandbox filesystem to a checkpoint state.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
				{ name: 'checkpointId', type: 'string', description: 'Checkpoint ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Restores the sandbox filesystem to the checkpoint state.',
			statuses: [
				{ code: 200, description: 'Checkpoint restored' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox or checkpoint not found' },
			],
			examplePath: '/sandbox/sbx_abc123/checkpoint/ckpt_def456/restore',
		},
		{
			id: 'delete-checkpoint',
			title: 'Delete Checkpoint',
			sectionTitle: 'Disk Checkpoints',
			method: 'DELETE',
			path: '/sandbox/{sandboxId}/checkpoint/{checkpointId}',
			description: 'Delete a checkpoint.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
				{ name: 'checkpointId', type: 'string', description: 'Checkpoint ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Checkpoint deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox or checkpoint not found' },
			],
			examplePath: '/sandbox/sbx_abc123/checkpoint/ckpt_def456',
		},
		// ── Runtimes ──────────────────────────────────────────────────────
		{
			id: 'list-runtimes',
			title: 'List Runtimes',
			sectionTitle: 'Runtimes',
			method: 'GET',
			path: '/sandbox/runtimes',
			description: 'List available sandbox runtimes with their requirements.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns available sandbox runtimes with their requirements.',
			responseFields: [
				{
					name: 'runtimes',
					type: 'array',
					description: 'Array of { id, name, description, iconUrl, tags, requirements }',
				},
				{ name: 'total', type: 'number', description: 'Total available runtimes' },
			],
			statuses: [
				{ code: 200, description: 'Runtimes returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/runtimes',
		},
		// ── CLI Endpoints ─────────────────────────────────────────────────
		{
			id: 'cli-list-sandboxes',
			title: 'List Sandboxes (Cross-Org)',
			sectionTitle: 'CLI Endpoints',
			method: 'GET',
			path: '/cli/sandbox',
			description: 'List sandboxes across all organizations the user belongs to.',
			pathParams: [],
			queryParams: [
				{ name: 'name', type: 'string', description: 'Filter by name', required: false },
				{
					name: 'mode',
					type: 'string',
					description: "'oneshot' or 'interactive'",
					required: false,
				},
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project',
					required: false,
				},
				{
					name: 'orgId',
					type: 'string',
					description: 'Filter by organization',
					required: false,
				},
				{ name: 'status', type: 'string', description: 'Filter by status', required: false },
				{ name: 'limit', type: 'number', description: 'Max 100', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
			],
			requestBody: null,
			responseDescription: 'Lists sandboxes across all organizations the user belongs to.',
			statuses: [
				{ code: 200, description: 'Sandboxes returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/cli/sandbox',
		},
		{
			id: 'cli-resolve-sandbox',
			title: 'Resolve Sandbox',
			sectionTitle: 'CLI Endpoints',
			method: 'GET',
			path: '/cli/sandbox/{sandboxId}',
			description:
				'Resolve a sandbox ID to its org, region, and project. Used for cross-org sandbox lookup.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Resolves a sandbox ID to its org, region, and project. Used for cross-org sandbox lookup.',
			responseFields: [
				{ name: 'id', type: 'string', description: 'Sandbox ID' },
				{ name: 'name', type: 'string', description: 'Sandbox name' },
				{ name: 'region', type: 'string', description: 'Region identifier' },
				{ name: 'status', type: 'string', description: 'Sandbox status' },
				{ name: 'orgId', type: 'string', description: 'Organization ID' },
				{ name: 'projectId', type: 'string', description: 'Project ID' },
			],
			statuses: [
				{ code: 200, description: 'Sandbox resolved' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/cli/sandbox/sbx_abc123',
		},
	],
};

const services: Service[] = [
	kvService,
	vectorService,
	objectStorageService,
	streamsService,
	queuesService,
	emailService,
	userService,
	threadService,
	evaluationsService,
	apiKeysService,
	regionService,
	databaseService,
	organizationsService,
	machinesService,
	schedulesService,
	webhooksService,
	sessionsService,
	projectsService,
	tasksService,
	sandboxesService,
];

const ROOT_DIR = join(import.meta.dir, '..');
const CONTENT_DIR = join(ROOT_DIR, 'src/web/content/reference/api');
const ROUTES_DIR = join(ROOT_DIR, 'src/web/routes/_docs/reference/api');

async function writeGeneratedFile(path: string, content: string) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${content.trimEnd()}\n`, 'utf-8');
}

function toParamTableInput(
	params: Param[],
	location: 'path' | 'query' | 'body' | 'header'
): Array<{
	name: string;
	type: string;
	in: 'path' | 'query' | 'body' | 'header';
	required: boolean;
	description: string;
	default?: string;
}> {
	return params.map((param) => ({
		name: param.name,
		type: param.type,
		in: location,
		required: param.required ?? true,
		description: param.description,
	}));
}

function renderStatuses(statuses: EndpointStatus[]): string {
	const rows = statuses.map((status) => `| ${status.code} | ${status.description} |`).join('\n');
	return ['| Status | Description |', '|--------|-------------|', rows].join('\n');
}

function renderResponseHeaders(headers: ResponseHeader[], subHeading: string): string {
	if (headers.length === 0) return '';

	const rows = headers
		.map((header) => `| \`${header.name}\` | ${header.description} |`)
		.join('\n');

	return [
		`${subHeading} Response Headers`,
		'',
		'| Header | Description |',
		'|--------|-------------|',
		rows,
	].join('\n');
}

function renderEndpointSection(endpoint: Endpoint, headingLevel = 2, host?: string): string {
	const subHeading = '#'.repeat(headingLevel + 1);
	const pathParams = toParamTableInput(endpoint.pathParams, 'path');
	const queryParams = toParamTableInput(endpoint.queryParams, 'query');

	const paramList = [...pathParams, ...queryParams];
	const paramSection =
		paramList.length > 0
			? [
					`${subHeading} Parameters`,
					'',
					`<ParamTable params={${JSON.stringify(paramList, null, 2)}} />`,
				].join('\n')
			: '';

	const requestBodyParts: string[] = [];
	if (endpoint.requestBody) {
		requestBodyParts.push('', `${subHeading} Request Body`, '');
		requestBodyParts.push(endpoint.requestBody.description, '');

		if (endpoint.requestBody.fields && endpoint.requestBody.fields.length > 0) {
			requestBodyParts.push(
				`<ResponseFields fields={${JSON.stringify(endpoint.requestBody.fields, null, 2)}} />`,
				''
			);
		}
	}

	const responseParts: string[] = [
		`${subHeading} Response`,
		'',
		endpoint.responseDescription,
		'',
		renderStatuses(endpoint.statuses),
	];

	if (endpoint.responseHeaders && endpoint.responseHeaders.length > 0) {
		responseParts.push('', renderResponseHeaders(endpoint.responseHeaders, subHeading));
	}

	if (endpoint.responseFields && endpoint.responseFields.length > 0) {
		responseParts.push(
			'',
			`${subHeading} Response Fields`,
			'',
			`<ResponseFields fields={${JSON.stringify(endpoint.responseFields, null, 2)}} />`
		);
	}

	if (endpoint.ttlNote) {
		responseParts.push('', `${subHeading} Notes`, '', endpoint.ttlNote);
	}

	const exampleProp =
		endpoint.exampleBody !== undefined
			? typeof endpoint.exampleBody === 'string'
				? ` body="${endpoint.exampleBody}"`
				: ` body={${JSON.stringify(endpoint.exampleBody, null, 2)}}`
			: '';

	const headersProp = endpoint.exampleHeaders
		? ` headers={${JSON.stringify(endpoint.exampleHeaders)}}`
		: '';

	const hostProp = host ? ` host="${host}"` : '';

	return [
		`${'#'.repeat(headingLevel)} ${endpoint.title}`,
		'',
		endpoint.description,
		'',
		`<ApiEndpoint method="${endpoint.method}" path="${endpoint.path}"${hostProp} />`,
		'',
		paramSection,
		requestBodyParts.join('\n'),
		responseParts.join('\n'),
		'',
		`${subHeading} Example`,
		'',
		`<ApiExample method="${endpoint.method}" path="${endpoint.examplePath}"${exampleProp}${headersProp}${hostProp} />`,
		'',
		'---',
	].join('\n');
}

function renderServiceMdx(service: Service): string {
	const endpointSectionsParts: string[] = [];
	let currentSectionTitle: string | null = null;
	const serviceIntro = `${service.description}.`;

	for (const endpoint of service.endpoints) {
		if (endpoint.sectionTitle && endpoint.sectionTitle !== currentSectionTitle) {
			currentSectionTitle = endpoint.sectionTitle;
			endpointSectionsParts.push(`## ${endpoint.sectionTitle}`);
		}

		endpointSectionsParts.push(
			renderEndpointSection(endpoint, endpoint.sectionTitle ? 3 : 2, service.host)
		);
	}

	const endpointSections = endpointSectionsParts.join('\n\n');

	return `---
title: ${service.name} API
description: ${service.description}
---

${serviceIntro}

<RegionPicker ${service.host ? `host="${service.host}" ` : ''}/>

## Authentication

${service.hasPublicEndpoints ? 'Most requests require a Bearer token. Pass your SDK key in the `Authorization` header. Public endpoints (such as listing and fetching public snapshots) are noted below and do not require authentication.' : 'All requests require a Bearer token. Pass your SDK key in the `Authorization` header.'}

| Header | Value |
|--------|-------|
| \`Authorization\` | \`Bearer YOUR_SDK_KEY\` |

You can find your SDK key in the [Agentuity Console](https://app.agentuity.com) under your project settings.

---

${endpointSections}`;
}

function renderApiIndexMdx() {
	return `---
title: REST API Reference
description: Direct HTTP access to Agentuity platform services
---

import { Activity, Box, Building, CheckCircle, Clock, Database, FolderKanban, Globe, HardDrive, Key, Layers, ListTodo, Mail, MessageSquare, Search, Server, Table, Timer, User, Webhook } from 'lucide-react';

Access Agentuity services directly via REST APIs. These endpoints let you integrate from any language or platform without the TypeScript SDK.

<Cards>
  <CardLink
    href="/reference/api/key-value"
    title="Key-Value Storage"
    description="Store and retrieve data by key within namespaces"
    icon={<Database className="size-5" />}
  />
  <CardLink
    href="/reference/api/vector"
    title="Vector Search"
    description="Semantic search with automatic embedding generation"
    icon={<Search className="size-5" />}
  />
  <CardLink
    href="/reference/api/object-storage"
    title="Object Storage"
    description="Store and manage files and binary objects in buckets"
    icon={<HardDrive className="size-5" />}
  />
  <CardLink
    href="/reference/api/streams"
    title="Durable Streams"
    description="Create durable, resumable data streams with public URLs"
    icon={<Activity className="size-5" />}
  />
  <CardLink
    href="/reference/api/queues"
    title="Message Queues"
    description="Publish, consume, and manage messages with worker and pub/sub queues"
    icon={<Layers className="size-5" />}
  />
  <CardLink
    href="/reference/api/email"
    title="Email"
    description="Send and receive emails with managed addresses and webhook destinations"
    icon={<Mail className="size-5" />}
  />
  <CardLink
    href="/reference/api/user"
    title="User"
    description="Get authenticated user information and organization memberships"
    icon={<User className="size-5" />}
  />
  <CardLink
    href="/reference/api/threads"
    title="Threads"
    description="Manage conversation threads for agent session state and user data"
    icon={<MessageSquare className="size-5" />}
  />
  <CardLink
    href="/reference/api/evaluations"
    title="Evaluations"
    description="List and retrieve evaluations and their run history"
    icon={<CheckCircle className="size-5" />}
  />
  <CardLink
    href="/reference/api/api-keys"
    title="API Keys"
    description="Create and manage API keys for authentication"
    icon={<Key className="size-5" />}
  />
  <CardLink
    href="/reference/api/regions"
    title="Regions"
    description="List available cloud regions and manage per-region resources"
    icon={<Globe className="size-5" />}
  />
  <CardLink
    href="/reference/api/database"
    title="Database"
    description="Execute queries, inspect tables, and monitor database performance"
    icon={<Table className="size-5" />}
  />
  <CardLink
    href="/reference/api/organizations"
    title="Organizations"
    description="Manage organizations, environment variables, and org-level resources"
    icon={<Building className="size-5" />}
  />
  <CardLink
    href="/reference/api/machines"
    title="Machines"
    description="Manage compute nodes and organization authentication enrollment"
    icon={<Server className="size-5" />}
  />
  <CardLink
    href="/reference/api/schedules"
    title="Schedules"
    description="Create and manage cron-based scheduled jobs with destinations and delivery tracking"
    icon={<Clock className="size-5" />}
  />
  <CardLink
    href="/reference/api/webhooks"
    title="Webhooks"
    description="Manage webhook endpoints, destinations, receipts, deliveries, and analytics"
    icon={<Webhook className="size-5" />}
  />
  <CardLink
    href="/reference/api/sessions"
    title="Sessions"
    description="View agent execution sessions with timing, cost, and observability data"
    icon={<Timer className="size-5" />}
  />
  <CardLink
    href="/reference/api/projects"
    title="Projects"
    description="Full project lifecycle management including deployments, agents, environment variables, and hostnames"
    icon={<FolderKanban className="size-5" />}
  />
  <CardLink
    href="/reference/api/tasks"
    title="Tasks"
    description="Full-featured task management with epics, features, bugs, comments, tags, attachments, and activity tracking"
    icon={<ListTodo className="size-5" />}
  />
  <CardLink
    href="/reference/api/sandboxes"
    title="Sandboxes"
    description="Create and manage isolated execution environments with full lifecycle, file system, snapshot, and checkpoint support"
    icon={<Box className="size-5" />}
  />
</Cards>`;
}

function renderServiceRoute(service: Service): string {
	return `import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/${service.slug}')({
	component: () => <MDXPage route="reference/api/${service.slug}" />,
	staticData: { crumb: '${service.name}' },
});`;
}

function renderApiIndexRoute(): string {
	return `import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/')({
	component: () => <MDXPage route="reference/api" />,
	staticData: { crumb: 'API Reference' },
});`;
}

async function main() {
	for (const service of services) {
		await writeGeneratedFile(join(CONTENT_DIR, `${service.slug}.mdx`), renderServiceMdx(service));
		await writeGeneratedFile(
			join(ROUTES_DIR, `${service.slug}.tsx`),
			renderServiceRoute(service)
		);
	}

	await writeGeneratedFile(join(CONTENT_DIR, 'index.mdx'), renderApiIndexMdx());
	await writeGeneratedFile(
		join(CONTENT_DIR, 'meta.json'),
		JSON.stringify(
			{
				title: 'API Reference',
				pages: services.map((service) => service.slug).sort(),
			},
			null,
			'\t'
		)
	);

	await writeGeneratedFile(join(ROUTES_DIR, 'index.tsx'), renderApiIndexRoute());

	console.log(`Generated API reference files for ${services.length} services`);
}

main().catch((error) => {
	console.error('Failed to generate API reference files:', error);
	process.exit(1);
});
