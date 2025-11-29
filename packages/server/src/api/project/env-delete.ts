import { z } from 'zod';
import { APIClient, APIResponseSchemaNoData } from '../api';
import { ProjectResponseError } from './util';

const _ProjectEnvDeleteRequestSchema = z.object({
	id: z.string().describe('the project id'),
	env: z.array(z.string()).optional().describe('environment variable keys to delete'),
	secrets: z.array(z.string()).optional().describe('secret keys to delete'),
});

const ProjectEnvDeleteResponseSchema = APIResponseSchemaNoData();

type ProjectEnvDeleteRequest = z.infer<typeof _ProjectEnvDeleteRequestSchema>;
type ProjectEnvDeleteResponse = z.infer<typeof ProjectEnvDeleteResponseSchema>;

/**
 * Delete environment variables and/or secrets from a project.
 * Provide arrays of keys to delete.
 */
export async function projectEnvDelete(
	client: APIClient,
	request: ProjectEnvDeleteRequest
): Promise<void> {
	const { id, env, secrets } = request;

	const resp = await client.request<ProjectEnvDeleteResponse, Omit<ProjectEnvDeleteRequest, 'id'>>(
		'DELETE',
		`/cli/project/${id}/env`,
		ProjectEnvDeleteResponseSchema,
		{
			env,
			secrets,
		}
	);

	if (!resp.success) {
		throw new ProjectResponseError({ message: resp.message ?? 'failed to delete project env' });
	}

	// Delete operations don't return data, success is sufficient
}
