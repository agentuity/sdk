import { z } from 'zod';
import { APIClient, APIResponseSchemaNoData } from '../api';
import { SandboxResponseError, API_VERSION } from './util';

const DestroyResponseSchema = APIResponseSchemaNoData();

export interface SandboxDestroyParams {
	sandboxId: string;
	orgId?: string;
}

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
	const url = `/sandbox/${API_VERSION}/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.delete<z.infer<typeof DestroyResponseSchema>>(
		url,
		DestroyResponseSchema
	);

	if (resp.success) {
		return;
	}

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}
