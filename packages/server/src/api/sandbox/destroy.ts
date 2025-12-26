import { z } from 'zod';
import { APIClient, APIResponseSchemaNoData } from '../api';
import { SandboxResponseError, API_VERSION } from './util';

const DestroyResponseSchema = APIResponseSchemaNoData();

export interface SandboxDestroyParams {
	sandboxId: string;
	orgId?: string;
}

export async function sandboxDestroy(client: APIClient, params: SandboxDestroyParams): Promise<void> {
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
