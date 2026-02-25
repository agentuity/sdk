import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { ProjectResponseError } from './util.ts';

// --- GET hostname ---

export const ProjectHostnameGetRequestSchema = z.object({
	projectId: z.string().describe('the project id'),
});

const HostnameGetDataSchema = z.object({
	hostname: z.string().nullable(),
	url: z.string().nullable(),
});

const ProjectHostnameGetResponseSchema = APIResponseSchema(HostnameGetDataSchema);

type ProjectHostnameGetRequest = z.infer<typeof ProjectHostnameGetRequestSchema>;
type ProjectHostnameGetResponse = z.infer<typeof ProjectHostnameGetResponseSchema>;

export type ProjectHostnameGetResult = z.infer<typeof HostnameGetDataSchema>;

export async function projectHostnameGet(
	client: APIClient,
	request: ProjectHostnameGetRequest
): Promise<ProjectHostnameGetResult> {
	const resp = await client.get<ProjectHostnameGetResponse>(
		`/cli/project/${request.projectId}/hostname`,
		ProjectHostnameGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ProjectResponseError({ message: resp.message });
}

// --- SET hostname ---

export const ProjectHostnameSetRequestSchema = z.object({
	projectId: z.string().describe('the project id'),
	hostname: z.string().describe('the vanity hostname to set'),
});

const HostnameSetDataSchema = z.object({
	hostname: z.string(),
	url: z.string(),
});

const ProjectHostnameSetResponseSchema = APIResponseSchema(HostnameSetDataSchema);

type ProjectHostnameSetRequest = z.infer<typeof ProjectHostnameSetRequestSchema>;
type ProjectHostnameSetResponse = z.infer<typeof ProjectHostnameSetResponseSchema>;

export type ProjectHostnameSetResult = z.infer<typeof HostnameSetDataSchema>;

export async function projectHostnameSet(
	client: APIClient,
	request: ProjectHostnameSetRequest
): Promise<ProjectHostnameSetResult> {
	const resp = await client.put<ProjectHostnameSetResponse>(
		`/cli/project/${request.projectId}/hostname`,
		{ hostname: request.hostname },
		ProjectHostnameSetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ProjectResponseError({ message: resp.message });
}
