import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

const APIKeyCreateResponseSchema = z.object({
	id: z.string().describe('the API key id'),
	value: z.string().describe('the API key value'),
});

const APIKeyCreateFullResponseSchema = APIResponseSchema(APIKeyCreateResponseSchema);

type APIKeyCreateFullResponse = z.infer<typeof APIKeyCreateFullResponseSchema>;

export type APIKeyCreateResponse = z.infer<typeof APIKeyCreateResponseSchema>;

export interface APIKeyCreateRequest {
	name: string;
	expiresAt: string;
	projectId?: string | null;
	orgId?: string | null;
}

/**
 * Create a new API key
 *
 * @param client
 * @param request the API key creation request
 * @returns
 */
export async function apikeyCreate(
	client: APIClient,
	request: APIKeyCreateRequest
): Promise<APIKeyCreateResponse> {
	const resp = await client.request<APIKeyCreateFullResponse>(
		'POST',
		'/cli/apikey',
		APIKeyCreateFullResponseSchema,
		request
	);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message);
}
