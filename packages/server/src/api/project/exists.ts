import { z } from 'zod';
import { APIClient, APIResponseSchema, APIError } from '../api';

const _ProjectExistsRequestSchema = z.object({
	name: z.string().max(255).min(1).describe('the name of the new project'),
	organization_id: z
		.string()
		.max(255)
		.min(1)
		.describe('the organization id to create the project in'),
});

const ProjectExistsResponseSchema = APIResponseSchema(z.boolean());

export type ProjectExistsRequest = z.infer<typeof _ProjectExistsRequestSchema>;
export type ProjectExistsResponse = z.infer<typeof ProjectExistsResponseSchema>;

/**
 * Check if a project exists by name within an organization
 *
 * @param client
 * @param body
 * @returns
 */
export async function projectExists(
	client: APIClient,
	body: ProjectExistsRequest
): Promise<boolean> {
	const qs = new URLSearchParams();
	qs.set('orgId', body.organization_id);
	try {
		const resp = await client.request<ProjectExistsResponse, ProjectExistsRequest>(
			'GET',
			`/cli/project/exists/${encodeURIComponent(body.name)}?${qs.toString()}`,
			ProjectExistsResponseSchema
		);

		if (resp.data) {
			return resp.data;
		}

		return false;
	} catch (ex) {
		const _ex = ex as Error;
		if (_ex.name === 'APIError') {
			const apiError = _ex as APIError;
			switch (apiError.status) {
				case 409:
					return true;
				case 422:
					return false;
				default:
			}
		}
		throw ex;
	}
}
