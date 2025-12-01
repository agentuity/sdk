import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { ThreadSchema } from './list';
import { ThreadResponseError } from './util';

const _ThreadGetRequestSchema = z.object({
	id: z.string().describe('the thread id'),
});

const ThreadGetResponseSchema = APIResponseSchema(ThreadSchema);

type ThreadGetRequest = z.infer<typeof _ThreadGetRequestSchema>;
type ThreadGetResponse = z.infer<typeof ThreadGetResponseSchema>;

export type Thread = z.infer<typeof ThreadSchema>;

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
