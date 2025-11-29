import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { APIKeyResponseError } from './util';

const APIKeyDetailSchema = z.object({
	id: z.string().describe('the API key id'),
	name: z.string().describe('the API key name'),
	orgId: z.string().describe('the organization id'),
	type: z.string().describe('the API key type'),
	expiresAt: z.string().datetime().nullable().describe('the expiration date'),
	lastUsedAt: z.string().datetime().nullable().optional().describe('the last used date'),
	createdAt: z.string().datetime().describe('the creation date'),
	project: z
		.object({
			id: z.string().describe('the project id'),
			name: z.string().describe('the project name'),
		})
		.nullable()
		.optional()
		.describe('the associated project'),
});

const APIKeyGetResponseSchema = APIResponseSchema(APIKeyDetailSchema);

type APIKeyGetResponse = z.infer<typeof APIKeyGetResponseSchema>;

export type APIKeyDetail = z.infer<typeof APIKeyDetailSchema>;

/**
 * Get a specific API key by id
 *
 * @param client
 * @param id the API key id
 * @returns
 */
export async function apikeyGet(client: APIClient, id: string): Promise<APIKeyDetail> {
	const resp = await client.request<APIKeyGetResponse>(
		'GET',
		`/cli/apikey/${id}`,
		APIKeyGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new APIKeyResponseError({ message: resp.message });
}
