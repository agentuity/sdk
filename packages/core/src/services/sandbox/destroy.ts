import { z } from 'zod';
import { type APIClient, APIResponseSchemaNoData } from '../api.ts';
import { throwSandboxError } from './util.ts';

export const DestroyResponseSchema = APIResponseSchemaNoData();

export const SandboxDestroyParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to destroy'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
});

export type SandboxDestroyParams = z.infer<typeof SandboxDestroyParamsSchema>;

/**
 * Destroys a sandbox and releases all associated resources.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID to destroy
 * @throws {SandboxResponseError} If the sandbox is not found or destruction fails
 */
export async function sandboxDestroy(
	client: APIClient,
	params: SandboxDestroyParams
): Promise<void> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.delete<z.infer<typeof DestroyResponseSchema>>(
		url,
		DestroyResponseSchema
	);

	if (resp.success) {
		return;
	}

	throwSandboxError(resp, { sandboxId });
}
