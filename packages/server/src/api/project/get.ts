import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { ProjectResponseError } from './util';

const _ProjectGetRequestSchema = z.object({
	id: z.string().describe('the project id'),
	mask: z.boolean().default(true).optional().describe('if the secrets should be returned masked'),
	keys: z.boolean().default(true).optional().describe('if the project keys should be returned'),
});

const ProjectSchema = z.object({
	id: z.string().describe('the project id'),
	name: z.string().describe('the project name'),
	description: z.string().nullable().optional().describe('the project description'),
	tags: z.array(z.string()).nullable().optional().describe('the project tags'),
	orgId: z.string().describe('the organization id'),
	cloudRegion: z.string().nullable().optional().describe('the cloud region'),
	api_key: z.string().optional().describe('the SDK api key for the project'),
	env: z.record(z.string(), z.string()).optional().describe('the environment key/values'),
	secrets: z.record(z.string(), z.string()).optional().describe('the secrets key/values'),
});

const ProjectGetResponseSchema = APIResponseSchema(ProjectSchema);

type ProjectGetRequest = z.infer<typeof _ProjectGetRequestSchema>;
type ProjectGetResponse = z.infer<typeof ProjectGetResponseSchema>;

export type Project = z.infer<typeof ProjectSchema>;

export async function projectGet(client: APIClient, request: ProjectGetRequest): Promise<Project> {
	const keys = request.keys ?? true;
	const resp = await client.get<ProjectGetResponse>(
		`/cli/project/${request.id}?mask=${request.mask ?? true}&includeProjectKeys=${keys}`,
		ProjectGetResponseSchema
	);

	if (resp.success) {
		if (keys && resp.data.secrets?.AGENTUITY_SDK_KEY) {
			return {
				...resp.data,
				api_key: resp.data.secrets.AGENTUITY_SDK_KEY,
			};
		}
		return resp.data;
	}

	throw new ProjectResponseError({ message: resp.message });
}
