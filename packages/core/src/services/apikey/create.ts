import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api.ts';
import { APIKeyResponseError } from './util.ts';

export const APIKeyCreateResponseSchema = z.object({
	id: z.string().describe('the API key id'),
	value: z.string().describe('the API key value'),
});

export const APIKeyCreateFullResponseSchema = APIResponseSchema(APIKeyCreateResponseSchema);

type _APIKeyCreateFullResponse = z.infer<typeof APIKeyCreateFullResponseSchema>;

export type APIKeyCreateResponse = z.infer<typeof APIKeyCreateResponseSchema>;

export const APIKeyCreateRequestSchema = z.object({
	name: z.string().describe('Name of the API key'),
	expiresAt: z.string().describe('Expiration timestamp for the API key'),
	projectId: z.string().nullable().optional().describe('Optional project scope for the key'),
	orgId: z.string().nullable().optional().describe('Optional organization scope for the key'),
});

export type APIKeyCreateRequest = z.infer<typeof APIKeyCreateRequestSchema>;

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
	const resp = await client.post(
		'/cli/apikey',
		request,
		APIKeyCreateFullResponseSchema,
		APIKeyCreateRequestSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new APIKeyResponseError({ message: resp.message });
}
