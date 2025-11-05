import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

const CreateProjectRequestSchema = z.object({
	name: z.string().max(255).min(1).describe('the name of the new project'),
	organization_id: z
		.string()
		.max(255)
		.min(1)
		.describe('the organization id to create the project in'),
	provider: z.string().max(255).min(1),
});

const CreateProjectResponse = z.object({
	id: z.string().describe('the unique id for the project'),
	api_key: z.string().describe('the SDK api key for the project'),
	projectKey: z.string().describe('the Project api key for the project'),
});

const CreateProjectResponseSchema = APIResponseSchema(CreateProjectResponse);

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;
export type NewProject = Omit<z.infer<typeof CreateProjectResponse>, 'projectKey'>;

/**
 * Create a new Project
 *
 * @param client
 * @param body
 * @returns
 */
export async function projectCreate(
	client: APIClient,
	body: CreateProjectRequest
): Promise<NewProject> {
	const resp = await client.request<CreateProjectResponse, CreateProjectRequest>(
		'POST',
		'/cli/project',
		CreateProjectResponseSchema,
		body,
		CreateProjectRequestSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message);
}
