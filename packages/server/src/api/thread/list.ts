import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { ThreadResponseError } from './util';

const ThreadSchema = z.object({
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

export { ThreadSchema };

const ThreadListResponse = z.array(ThreadSchema);

const ThreadListResponseSchema = APIResponseSchema(ThreadListResponse);

export type ThreadListResponse = z.infer<typeof ThreadListResponseSchema>;
export type ThreadList = z.infer<typeof ThreadListResponse>;
export type Thread = z.infer<typeof ThreadSchema>;

export interface ThreadListOptions {
	count?: number;
	orgId?: string;
	projectId?: string;
	metadata?: Record<string, unknown>;
}

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
	const { count = 10, orgId, projectId, metadata } = options;
	const params = new URLSearchParams({ count: count.toString() });
	if (orgId) params.set('orgId', orgId);
	if (projectId) params.set('projectId', projectId);
	if (metadata) params.set('metadata', JSON.stringify(metadata));

	const resp = await client.request<ThreadListResponse>(
		'GET',
		`/thread/2025-03-17?${params.toString()}`,
		ThreadListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ThreadResponseError({ message: resp.message });
}
