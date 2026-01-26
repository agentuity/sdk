import { z } from 'zod';
import { APIClient, APIResponseSchemaNoData } from '../api';
import { OrgResponseError } from './util';

const _OrgEnvDeleteRequestSchema = z.object({
	id: z.string().describe('the organization id'),
	env: z.array(z.string()).optional().describe('environment variable keys to delete'),
	secrets: z.array(z.string()).optional().describe('secret keys to delete'),
});

const OrgEnvDeleteResponseSchema = APIResponseSchemaNoData();

type OrgEnvDeleteRequest = z.infer<typeof _OrgEnvDeleteRequestSchema>;
type OrgEnvDeleteResponse = z.infer<typeof OrgEnvDeleteResponseSchema>;

/**
 * Delete environment variables and/or secrets from an organization.
 * Provide arrays of keys to delete.
 * Requires admin/owner role.
 */
export async function orgEnvDelete(client: APIClient, request: OrgEnvDeleteRequest): Promise<void> {
	const { id, env, secrets } = request;

	const resp = await client.request<OrgEnvDeleteResponse, Omit<OrgEnvDeleteRequest, 'id'>>(
		'DELETE',
		`/cli/organization/${id}/env`,
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
