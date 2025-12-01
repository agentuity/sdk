import { z } from 'zod';
import { APIClient, APIResponseSchemaNoData } from '../api';
import { ThreadResponseError } from './util';

const _ThreadDeleteRequestSchema = z.object({
	id: z.string().describe('the thread id'),
});

const ThreadDeleteResponseSchema = APIResponseSchemaNoData();

type ThreadDeleteRequest = z.infer<typeof _ThreadDeleteRequestSchema>;
type ThreadDeleteResponse = z.infer<typeof ThreadDeleteResponseSchema>;

/**
 * Delete a thread by id
 *
 * @param client
 * @param request
 * @returns
 */
export async function threadDelete(client: APIClient, request: ThreadDeleteRequest): Promise<void> {
	const resp = await client.request<ThreadDeleteResponse>(
		'DELETE',
		`/thread/2025-03-17/${request.id}`,
		ThreadDeleteResponseSchema
	);

	if (!resp.success) {
		throw new ThreadResponseError({ message: resp.message });
	}
}
