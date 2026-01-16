import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { OrgResponseError } from './util';

const OrgEnvDataSchema = z.object({
	id: z.string().describe('the organization id'),
	env: z.record(z.string(), z.string()).optional().describe('environment variables'),
	secrets: z.record(z.string(), z.string()).optional().describe('secrets (may be masked)'),
});

const OrgEnvGetResponseSchema = APIResponseSchema(OrgEnvDataSchema);

interface OrgEnvGetRequest {
	id: string;
	mask?: boolean;
}
type OrgEnvGetResponse = z.infer<typeof OrgEnvGetResponseSchema>;

export type OrgEnv = z.infer<typeof OrgEnvDataSchema>;

/**
 * Get environment variables and secrets for an organization.
 * Secrets are masked by default unless mask=false is specified.
 * Note: Unmasked values require admin/owner role.
 */
export async function orgEnvGet(
	client: APIClient,
	request: OrgEnvGetRequest
): Promise<OrgEnv> {
	const { id, mask = true } = request;

	const resp = await client.get<OrgEnvGetResponse>(
		`/cli/organization/${id}/env?mask=${mask}`,
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
