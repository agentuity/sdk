import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

const _ProjectGetRequestSchema = z.object({
	id: z.string().describe('the project id'),
	mask: z.boolean().default(true).describe('if the secrets should be returned masked'),
});

const ProjectGetResponseSchema = APIResponseSchema(
	z.object({
		id: z.string().describe('the project id'),
		orgId: z.string().describe('the organization id'),
		api_key: z.string().optional().describe('the SDK api key for the project'),
		env: z.record(z.string(), z.string()).optional().describe('the environment key/values'),
		secrets: z.record(z.string(), z.string()).optional().describe('the secrets key/values'),
	})
);

type ProjectGetRequest = z.infer<typeof _ProjectGetRequestSchema>;
type ProjectGetResponse = z.infer<typeof ProjectGetResponseSchema>;

export type Project = NonNullable<ProjectGetResponse['data']>;

export async function projectGet(client: APIClient, request: ProjectGetRequest): Promise<Project> {
	const resp = await client.request<ProjectGetResponse, ProjectGetRequest>(
		'GET',
		`/cli/project/${request.id}?mask=${request.mask ?? true}`,
		ProjectGetResponseSchema
	);

	if (resp.data) {
		return resp.data;
	}

	throw new Error(resp.message ?? 'failed to get project');
}
