import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { OrgResponseError } from './util.ts';

export const OrgEnvDataSchema = z.object({
	id: z.string().describe('the organization id'),
	env: z.record(z.string(), z.string()).optional().describe('environment variables'),
	secrets: z.record(z.string(), z.string()).optional().describe('secrets (may be masked)'),
});

export const OrgEnvGetResponseSchema = APIResponseSchema(OrgEnvDataSchema);

export const OrgEnvGetOptionsSchema = z.object({
	id: z.string().describe('Organization ID to fetch environment variables for'),
	mask: z
		.boolean()
		.optional()
		.describe('Whether secret values should be masked in the response (default true)'),
});

export type OrgEnvGetOptions = z.infer<typeof OrgEnvGetOptionsSchema>;
export type OrgEnvGetResponse = z.infer<typeof OrgEnvGetResponseSchema>;

export type OrgEnv = z.infer<typeof OrgEnvDataSchema>;

/**
 * Get environment variables and secrets for an organization.
 * Secrets are masked by default unless mask=false is specified.
 * Note: Unmasked values require admin/owner role.
 */
export async function orgEnvGet(client: APIClient, request: OrgEnvGetOptions): Promise<OrgEnv> {
	const { id, mask = true } = request;

	const resp = await client.get<OrgEnvGetResponse>(
		`/cli/organization/${encodeURIComponent(id)}/env?mask=${mask}`,
		OrgEnvGetResponseSchema
	);

	if (!resp.success) {
		throw new OrgResponseError({ message: resp.message ?? 'failed to get org env' });
	}

	if (!resp.data) {
		throw new OrgResponseError({ message: 'failed to get org env: no data returned' });
	}

	return resp.data;
}
