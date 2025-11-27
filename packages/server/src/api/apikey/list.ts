import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

export const APIKeySchema = z.object({
	id: z.string().describe('the API key id'),
	name: z.string().describe('the API key name'),
	orgId: z.string().describe('the organization id'),
	type: z.string().describe('the API key type'),
	expiresAt: z.string().datetime().nullable().describe('the expiration date'),
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

export const APIKeyListResponseArray = z.array(APIKeySchema);

const APIKeyListResponseSchema = APIResponseSchema(APIKeyListResponseArray);

export type APIKeyListResponse = z.infer<typeof APIKeyListResponseSchema>;
export type APIKeyList = z.infer<typeof APIKeyListResponseArray>;
export type APIKey = z.infer<typeof APIKeySchema>;

export interface APIKeyListRequest {
	orgId?: string;
	projectId?: string;
}

/**
 * List all API keys
 *
 * @param client
 * @param request optional filters for orgId and projectId
 * @returns
 */
export async function apikeyList(
	client: APIClient,
	request?: APIKeyListRequest
): Promise<APIKeyList> {
	const params = new URLSearchParams();
	if (request?.orgId) {
		params.set('orgId', request.orgId);
	}
	if (request?.projectId) {
		params.set('projectId', request.projectId);
	}
	const queryString = params.toString();
	const endpoint = `/cli/apikey${queryString ? `?${queryString}` : ''}`;

	const resp = await client.request<APIKeyListResponse>('GET', endpoint, APIKeyListResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message);
}
