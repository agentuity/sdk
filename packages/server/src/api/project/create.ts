import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { ProjectResponseError } from './util';

const CreateProjectRequestSchema = z.object({
	name: z.string().max(255).min(1).describe('the name of the new project'),
	orgId: z.string().max(255).min(1).describe('the organization id to create the project in'),
	cloudRegion: z.string().describe('the cloud region to create the project'),
});

const CreateProjectResponse = z.object({
	id: z.string().describe('the unique id for the project'),
	sdkKey: z.string().describe('the SDK key for the project'),
});

const CreateProjectResponseSchema = APIResponseSchema(CreateProjectResponse);

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;
export type NewProject = z.infer<typeof CreateProjectResponse>;

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
	throw new ProjectResponseError({ message: resp.message });
}
