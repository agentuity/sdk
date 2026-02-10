import { z } from 'zod';
import { APIClient, APIResponseSchemaNoData } from '../api';
import { OrgResponseError } from './util';

export const OrgEnvUpdateRequestSchema = z.object({
	id: z.string().describe('the organization id'),
	env: z.record(z.string(), z.string()).optional().describe('environment variables to set/update'),
	secrets: z.record(z.string(), z.string()).optional().describe('secrets to set/update'),
});

export const OrgEnvUpdateResponseSchema = APIResponseSchemaNoData();

export type OrgEnvUpdateRequest = z.infer<typeof OrgEnvUpdateRequestSchema>;
export type OrgEnvUpdateResponse = z.infer<typeof OrgEnvUpdateResponseSchema>;

/**
 * Update environment variables and/or secrets for an organization.
 * This will merge the provided env/secrets with existing values.
 * Requires admin/owner role.
 * Keys starting with 'AGENTUITY_' (except AGENTUITY_PUBLIC_) are filtered out.
 */
export async function orgEnvUpdate(client: APIClient, request: OrgEnvUpdateRequest): Promise<void> {
	const { id, env, secrets } = request;

	const resp = await client.request<OrgEnvUpdateResponse, Omit<OrgEnvUpdateRequest, 'id'>>(
		'PUT',
		`/cli/organization/${id}/env`,
		OrgEnvUpdateResponseSchema,
		{
			env,
			secrets,
		}
	);

	if (!resp.success) {
		throw new OrgResponseError({ message: resp.message ?? 'failed to update org env' });
	}
}
