import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api';

const ListOrganizationsResponseSchema = APIResponseSchema(
	z.array(
		z.object({
			id: z.string().describe('the unique id for the organization'),
			name: z.string().describe('the name of the organization'),
		})
	)
);

export type ListOrganizationsResponse = z.infer<typeof ListOrganizationsResponseSchema>;
export type OrganizationList = NonNullable<ListOrganizationsResponse['data']>;

/**
 * List all organizations
 *
 * @param client
 * @returns
 */
export async function listOrganizations(client: APIClient): Promise<ListOrganizationsResponse> {
	return client.request<ListOrganizationsResponse>(
		'GET',
		'/cli/organization',
		ListOrganizationsResponseSchema
	);
}
