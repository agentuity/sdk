import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

const ProjectDeleteRequestSchema = z.object({ ids: z.array(z.string()) });
const ProjectDeleteResponseSchema = APIResponseSchema(z.array(z.string()));

type ProjectDeleteRequest = z.infer<typeof ProjectDeleteRequestSchema>;
type ProjectDeleteResponse = z.infer<typeof ProjectDeleteResponseSchema>;

export async function projectDelete(client: APIClient, ...ids: string[]) {
	const resp = await client.request<ProjectDeleteResponse, ProjectDeleteRequest>(
		'DELETE',
		'/cli/project',
		ProjectDeleteResponseSchema,
		{ ids },
		ProjectDeleteRequestSchema
	);

	if (resp.data) {
		return resp.data;
	}

	throw new Error(resp.message ?? 'failed to delete project');
}
