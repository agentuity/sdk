import type { z } from 'zod';
import { type APIClient, APIResponseSchemaNoData } from '../api.ts';
import { throwSandboxError } from './util.ts';

export const ResumeResponseSchema = APIResponseSchemaNoData();

export interface SandboxResumeParams {
	sandboxId: string;
	orgId?: string;
}

/**
 * Resumes a paused sandbox from its checkpoint.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID to resume
 * @throws {SandboxResponseError} If the sandbox is not found or resume fails
 */
export async function sandboxResume(client: APIClient, params: SandboxResumeParams): Promise<void> {
	const { sandboxId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${sandboxId}/resume${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof ResumeResponseSchema>>(
		url,
		undefined,
		ResumeResponseSchema
	);

	if (resp.success) {
		return;
	}

	throwSandboxError(resp, { sandboxId });
}
