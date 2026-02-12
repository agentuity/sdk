import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { ThreadSchema, type Thread } from './list';
import { ThreadResponseError } from './util';

export const _ThreadGetRequestSchema = z.object({
	id: z.string().describe('the thread id'),
});

export const ThreadGetResponseSchema = APIResponseSchema(ThreadSchema);

export type ThreadGetRequest = z.infer<typeof _ThreadGetRequestSchema>;
export type ThreadGetResponse = z.infer<typeof ThreadGetResponseSchema>;

/**
 * Get a single thread by id
 *
 * @param client
 * @param request
 * @returns
 */
export async function threadGet(client: APIClient, request: ThreadGetRequest): Promise<Thread> {
	const resp = await client.request<ThreadGetResponse>(
		'GET',
		`/thread/2025-03-17/${request.id}`,
		ThreadGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ThreadResponseError({ message: resp.message });
}
