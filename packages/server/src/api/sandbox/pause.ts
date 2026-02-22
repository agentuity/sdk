import type { z } from 'zod';
import { type APIClient, APIResponseSchemaNoData } from '../api';
import { API_VERSION, throwSandboxError } from './util';

export const PauseResponseSchema = APIResponseSchemaNoData();

export interface SandboxPauseParams {
	sandboxId: string;
	orgId?: string;
}

/**
 * Pauses a running sandbox, creating a checkpoint of its current state.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID to pause
 * @throws {SandboxResponseError} If the sandbox is not found or pause fails
 */
export async function sandboxPause(client: APIClient, params: SandboxPauseParams): Promise<void> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}/${sandboxId}/pause${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof PauseResponseSchema>>(
		url,
		undefined,
		PauseResponseSchema
	);

	if (resp.success) {
		return;
	}

	throwSandboxError(resp, { sandboxId });
}
