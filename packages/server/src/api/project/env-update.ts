import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import type { Project } from './get';
import { projectGet } from './get';

const _ProjectEnvUpdateRequestSchema = z.object({
	id: z.string().describe('the project id'),
	env: z.record(z.string(), z.string()).optional().describe('environment variables to set/update'),
	secrets: z.record(z.string(), z.string()).optional().describe('secrets to set/update'),
});

const ProjectEnvUpdateResponseSchema = APIResponseSchema(
	z
		.object({
			id: z.string().describe('the project id'),
			orgId: z.string().describe('the organization id'),
			api_key: z.string().optional().describe('the SDK api key for the project'),
			env: z.record(z.string(), z.string()).optional().describe('the environment key/values'),
			secrets: z.record(z.string(), z.string()).optional().describe('the secrets key/values'),
		})
		.optional()
);

type ProjectEnvUpdateRequest = z.infer<typeof _ProjectEnvUpdateRequestSchema>;
type ProjectEnvUpdateResponse = z.infer<typeof ProjectEnvUpdateResponseSchema>;

/**
 * Update environment variables and/or secrets for a project.
 * This will merge the provided env/secrets with existing values.
 * Keys starting with 'AGENTUITY_' should be filtered out before calling this function.
 */
export async function projectEnvUpdate(
	client: APIClient,
	request: ProjectEnvUpdateRequest
): Promise<Project> {
	const { id, env, secrets } = request;

	const resp = await client.request<ProjectEnvUpdateResponse, Omit<ProjectEnvUpdateRequest, 'id'>>(
		'PUT',
		`/cli/project/${id}/env`,
		ProjectEnvUpdateResponseSchema,
		{
			env,
			secrets,
		}
	);

	if (!resp.success) {
		throw new Error(resp.message ?? 'failed to update project env');
	}

	if (resp.data) {
		return resp.data;
	}

	// If the API didn't return data, fetch the updated project
	// This handles backends that return success without the full project data
	return projectGet(client, { id, mask: false });
}
