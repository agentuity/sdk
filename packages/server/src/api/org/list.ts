import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api';
import { OrgResponseError } from './util';

const ListOrganizationsResponse = z.array(
	z.object({
		id: z.string().describe('the unique id for the organization'),
		name: z.string().describe('the name of the organization'),
	})
);
const ListOrganizationsResponseSchema = APIResponseSchema(ListOrganizationsResponse);

export type ListOrganizationsResponse = z.infer<typeof ListOrganizationsResponseSchema>;
export type OrganizationList = z.infer<typeof ListOrganizationsResponse>;

/**
 * List all organizations
 *
 * @param client
 * @returns
 */
export async function listOrganizations(client: APIClient): Promise<OrganizationList> {
	const resp = await client.request<ListOrganizationsResponse>(
		'GET',
		'/cli/organization',
		ListOrganizationsResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new OrgResponseError({ message: resp.message });
}
