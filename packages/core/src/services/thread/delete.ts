import { z } from 'zod';
import { APIClient, APIResponseSchemaNoData } from '../api.ts';
import { ThreadResponseError } from './util.ts';

export const _ThreadDeleteRequestSchema = z.object({
	id: z.string().describe('the thread id'),
});

export const ThreadDeleteResponseSchema = APIResponseSchemaNoData();

export type ThreadDeleteRequest = z.infer<typeof _ThreadDeleteRequestSchema>;
export type ThreadDeleteResponse = z.infer<typeof ThreadDeleteResponseSchema>;

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
		`/thread/${request.id}`,
		ThreadDeleteResponseSchema
	);

	if (!resp.success) {
		throw new ThreadResponseError({ message: resp.message });
	}
}
