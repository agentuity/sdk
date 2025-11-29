import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { APIKeyResponseError } from './util';

const APIKeyDeleteResponseSchema = APIResponseSchema(
	z.number().describe('number of rows affected')
);

type APIKeyDeleteResponse = z.infer<typeof APIKeyDeleteResponseSchema>;

/**
 * Delete an API key (soft delete)
 *
 * @param client
 * @param id the API key id to delete
 * @returns number of rows affected
 */
export async function apikeyDelete(client: APIClient, id: string): Promise<number> {
	const resp = await client.request<APIKeyDeleteResponse>(
		'DELETE',
		`/cli/apikey/${id}`,
		APIKeyDeleteResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new APIKeyResponseError({ message: resp.message });
}
