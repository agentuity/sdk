import { SortDirectionSchema } from '../pagination.ts';
import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api.ts';
import { ThreadResponseError } from './util.ts';

export const ThreadSchema = z.object({
	id: z.string().describe('the thread id'),
	created_at: z.string().describe('the creation timestamp'),
	updated_at: z.string().describe('the last update timestamp'),
	deleted: z.boolean().describe('whether the thread is deleted'),
	deleted_at: z.string().nullable().describe('the deletion timestamp'),
	deleted_by: z.string().nullable().describe('who deleted the thread'),
	org_id: z.string().describe('the organization id'),
	project_id: z.string().describe('the project id'),
	user_data: z.string().nullable().optional().describe('the user data as JSON'),
	metadata: z
		.record(z.string(), z.unknown())
		.nullable()
		.optional()
		.describe('unencrypted key-value metadata'),
});

export const ThreadListResponseData = z.array(ThreadSchema);

export const ThreadListResponseSchema = APIResponseSchema(ThreadListResponseData);

export type ThreadListResponse = z.infer<typeof ThreadListResponseSchema>;
export type ThreadList = z.infer<typeof ThreadListResponseData>;
export type Thread = z.infer<typeof ThreadSchema>;

export type ThreadSortField = 'created' | 'updated';

export const ThreadListOptionsSchema = z.object({
	count: z.number().optional().describe('Deprecated alias for limit'),
	limit: z.number().optional().describe('Maximum number of threads to return'),
	offset: z.number().optional().describe('Pagination offset'),
	sort: z.enum(['created', 'updated']).optional().describe('Field to sort threads by'),
	direction: SortDirectionSchema.optional().describe('Sort direction for thread listing'),
	orgId: z.string().optional().describe('Optional organization id filter'),
	projectId: z.string().optional().describe('Optional project id filter'),
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Optional metadata match filter serialized as JSON'),
});

export type ThreadListOptions = z.infer<typeof ThreadListOptionsSchema>;

/**
 * List threads
 *
 * @param client
 * @param options filtering and pagination options
 * @returns
 */
export async function threadList(
	client: APIClient,
	options: ThreadListOptions = {}
): Promise<ThreadList> {
	const { limit, count, offset, sort, direction, orgId, projectId, metadata } = options;
	const resolvedLimit = limit ?? count ?? 10;
	const params = new URLSearchParams({ limit: resolvedLimit.toString() });
	if (orgId) params.set('orgId', orgId);
	if (projectId) params.set('projectId', projectId);
	if (offset !== undefined) params.set('offset', offset.toString());
	if (sort) params.set('sort', sort);
	if (direction) params.set('direction', direction);
	if (metadata) params.set('metadata', JSON.stringify(metadata));

	const resp = await client.request<ThreadListResponse>(
		'GET',
		`/thread?${params.toString()}`,
		ThreadListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ThreadResponseError({ message: resp.message });
}
