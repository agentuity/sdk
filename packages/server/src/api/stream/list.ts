import type { SortDirection } from '@agentuity/core';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { StreamResponseError } from './util.ts';

export const StreamInfoSchema = z.object({
	id: z.string().describe('the stream id'),
	namespace: z.string().describe('the stream namespace'),
	metadata: z.record(z.string(), z.string()).describe('stream metadata'),
	url: z.string().describe('public URL to access the stream'),
	sizeBytes: z.number().describe('size in bytes'),
	expiresAt: z.string().nullable().describe('ISO 8601 expiration timestamp or null'),
	orgId: z.string().describe('the organization id'),
	projectId: z.string().nullable().describe('the project id'),
	projectName: z.string().nullable().describe('the project name'),
});

export const StreamListDataSchema = z.object({
	streams: z.array(StreamInfoSchema).describe('list of streams'),
	total: z.number().describe('total count of matching streams'),
});

export const StreamListResponseSchema = APIResponseSchema(StreamListDataSchema);

export type StreamListResponse = z.infer<typeof StreamListResponseSchema>;
export type StreamListData = z.infer<typeof StreamListDataSchema>;
export type StreamInfo = z.infer<typeof StreamInfoSchema>;

export interface StreamListOptions {
	/**
	 * Filter by specific project ID
	 */
	projectId?: string;
	/**
	 * Filter by specific organization ID
	 */
	orgId?: string;
	/**
	 * Filter by stream namespace
	 */
	namespace?: string;
	/**
	 * Filter by stream name
	 */
	name?: string;
	/**
	 * Maximum number of streams to return (default: 100, max: 1000)
	 */
	limit?: number;
	/**
	 * Number of streams to skip for pagination
	 */
	offset?: number;
	/**
	 * Filter by metadata key-value pairs
	 */
	metadata?: Record<string, string>;
	/**
	 * Field to sort by
	 */
	sort?: string;
	/**
	 * Sort direction (default: 'desc')
	 */
	direction?: SortDirection;
}

/**
 * List streams with optional filtering.
 *
 * If no projectId or orgId is provided, returns streams from all orgs the user is a member of.
 *
 * @param client - The API client
 * @param options - Filtering and pagination options
 * @returns A promise that resolves to the list of streams with metadata
 *
 * @example
 * // List all streams across all orgs
 * const result = await streamList(client);
 * console.log(`Found ${result.total} streams`);
 *
 * @example
 * // List streams for a specific project
 * const result = await streamList(client, { projectId: 'proj_123' });
 *
 * @example
 * // List streams with namespace filter
 * const result = await streamList(client, { namespace: 'agent-logs' });
 *
 * @example
 * // List streams with metadata filter
 * const result = await streamList(client, {
 *   metadata: { type: 'export', env: 'production' }
 * });
 */
export async function streamList(
	client: APIClient,
	options: StreamListOptions = {}
): Promise<StreamListData> {
	const { projectId, orgId, namespace, name, limit, offset, metadata } = options;
	const params = new URLSearchParams();

	if (projectId) params.set('projectId', projectId);
	if (orgId) params.set('orgId', orgId);
	if (namespace) params.set('namespace', namespace);
	if (name) params.set('name', name);
	if (limit !== undefined) params.set('limit', limit.toString());
	if (offset !== undefined) params.set('offset', offset.toString());
	if (metadata && Object.keys(metadata).length > 0) {
		params.set('metadata', JSON.stringify(metadata));
	}
	if (options.sort) params.set('sort', options.sort);
	if (options.direction) params.set('direction', options.direction);

	const queryString = params.toString();
	const resp = await client.request<StreamListResponse>(
		'GET',
		`/cli/stream${queryString ? `?${queryString}` : ''}`,
		StreamListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new StreamResponseError({ message: resp.message });
}
