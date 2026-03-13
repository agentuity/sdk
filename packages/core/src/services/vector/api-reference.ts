import { z } from 'zod';
import {
	VectorNamespaceStatsWithSamplesSchema,
	VectorSearchParamsSchema,
	VectorStatsPaginatedSchema,
	VectorUpsertBaseSchema,
} from './service.ts';
import {
	VectorDeleteMultipleRequestSchema,
	VectorDeleteResponseSchema,
	VectorGetResponseSchema,
	VectorSearchResponseSchema,
	VectorUpsertResponseSchema,
} from './types.ts';
import type { Service } from '../api-reference.ts';

const service: Service = {
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
				fields: { schema: VectorUpsertBaseSchema },
			},
			responseDescription: 'JSON response with inserted/updated vector IDs.',
			responseFields: { schema: VectorUpsertResponseSchema },
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
			responseFields: { schema: VectorGetResponseSchema },
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
				fields: {
					schema: VectorSearchParamsSchema(z.record(z.string(), z.unknown())),
				},
			},
			responseDescription: 'JSON response containing matching vectors and similarity scores.',
			responseFields: { schema: VectorSearchResponseSchema },
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
			responseFields: { schema: VectorDeleteResponseSchema },
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
				fields: { schema: VectorDeleteMultipleRequestSchema, stripRequired: true },
			},
			responseDescription: 'JSON response with number of deleted vectors.',
			responseFields: { schema: VectorDeleteResponseSchema },
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
			responseFields: { schema: VectorNamespaceStatsWithSamplesSchema, omit: ['internal'] },
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
			responseFields: { schema: VectorStatsPaginatedSchema },
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

export default service;
