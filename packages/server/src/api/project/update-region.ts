import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { ProjectResponseError } from './util';

const UpdateRegionRequestSchema = z.object({
	cloudRegion: z.string().describe('the cloud region to update the project to'),
});

const UpdateRegionResponseSchema = APIResponseSchema(
	z.object({
		id: z.string().describe('the project id'),
	})
);

type UpdateRegionRequest = z.infer<typeof UpdateRegionRequestSchema>;
type UpdateRegionResponse = z.infer<typeof UpdateRegionResponseSchema>;

/**
 * Update a project's cloud region
 *
 * @param client - The API client
 * @param projectId - The project id to update
 * @param region - The new cloud region
 * @returns The project id on success
 */
export async function projectUpdateRegion(
	client: APIClient,
	projectId: string,
	region: string
): Promise<{ id: string }> {
	const resp = await client.request<UpdateRegionResponse, UpdateRegionRequest>(
		'PATCH',
		`/cli/project/${projectId}`,
		UpdateRegionResponseSchema,
		{ cloudRegion: region },
		UpdateRegionRequestSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ProjectResponseError({ message: resp.message ?? 'failed to update project region' });
}
