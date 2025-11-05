import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

const ProjectListResponse = z.array(
	z.object({
		id: z.string().describe('the project id'),
		name: z.string().describe('the project name'),
		description: z.string().optional().describe('the project description'),
		orgId: z.string().describe('the organization id that this project is registered with'),
		orgName: z.string().describe('the organization name'),
	})
);

const ProjectListResponseSchema = APIResponseSchema(ProjectListResponse);

export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
export type ProjectList = z.infer<typeof ProjectListResponse>;

/**
 * List all projects
 *
 * @param client
 * @returns
 */
export async function projectList(client: APIClient): Promise<ProjectList> {
	const resp = await client.request<ProjectListResponse>(
		'GET',
		'/cli/project',
		ProjectListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message);
}
