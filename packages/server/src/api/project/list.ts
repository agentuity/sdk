import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { ProjectResponseError } from './util';

const ProjectListResponse = z.array(
	z.object({
		id: z.string().describe('the project id'),
		name: z.string().describe('the project name'),
		description: z.string().optional().describe('the project description'),
		orgId: z.string().describe('the organization id that this project is registered with'),
		orgName: z.string().describe('the organization name'),
		latestDeploymentId: z.string().nullable().describe('the latest deployment id'),
	})
);

const ProjectListResponseSchema = APIResponseSchema(ProjectListResponse);

export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
export type ProjectList = z.infer<typeof ProjectListResponse>;

/**
 * List all projects
 *
 * @param client
 * @param hasDeployment if true, filter by projects with at least one deployment
 * @param limit maximum number of projects to return (default: 1000, max: 10000)
 * @returns
 */
export async function projectList(
	client: APIClient,
	hasDeployment?: boolean,
	limit?: number
): Promise<ProjectList> {
	const params = new URLSearchParams();
	if (hasDeployment) {
		params.append('hasDeployment', 'true');
	}
	if (limit !== undefined) {
		params.append('limit', limit.toString());
	}
	const queryString = params.toString();
	const resp = await client.request<ProjectListResponse>(
		'GET',
		`/cli/project${queryString ? `?${queryString}` : ''}`,
		ProjectListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ProjectResponseError({ message: resp.message });
}
