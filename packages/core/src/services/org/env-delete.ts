import { z } from 'zod';
import { type APIClient, APIResponseSchemaNoData } from '../api.ts';
import { OrgResponseError } from './util.ts';

export const OrgEnvDeleteRequestSchema = z.object({
	id: z.string().describe('the organization id'),
	env: z.array(z.string()).optional().describe('environment variable keys to delete'),
	secrets: z.array(z.string()).optional().describe('secret keys to delete'),
});

export const OrgEnvDeleteResponseSchema = APIResponseSchemaNoData();

export type OrgEnvDeleteRequest = z.infer<typeof OrgEnvDeleteRequestSchema>;
export type OrgEnvDeleteResponse = z.infer<typeof OrgEnvDeleteResponseSchema>;

/**
 * Delete environment variables and/or secrets from an organization.
 * Provide arrays of keys to delete.
 * Requires admin/owner role.
 */
export async function orgEnvDelete(client: APIClient, request: OrgEnvDeleteRequest): Promise<void> {
	const { id, env, secrets } = request;

	const resp = await client.request<OrgEnvDeleteResponse, Omit<OrgEnvDeleteRequest, 'id'>>(
		'DELETE',
		`/cli/organization/${encodeURIComponent(id)}/env`,
		OrgEnvDeleteResponseSchema,
		{
			env,
			secrets,
		}
	);

	if (!resp.success) {
		throw new OrgResponseError({ message: resp.message ?? 'failed to delete org env' });
	}
}
