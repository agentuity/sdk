import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api';

const OrganizationSchema = z.object({
	id: z.string().describe('the unique id for the organization'),
	name: z.string().describe('the name of the organization'),
});

const WhoamiResponse = z.object({
	firstName: z.string().describe('the first name of the user'),
	lastName: z.string().describe('the last name of the user'),
	organizations: z.array(OrganizationSchema).describe('the organizations the user is a member of'),
});
const WhoamiResponseSchema = APIResponseSchema(WhoamiResponse);

export type WhoamiResponse = z.infer<typeof WhoamiResponseSchema>;
export type User = z.infer<typeof WhoamiResponse>;

/**
 * Get the current authenticated user information
 *
 * @param client
 * @returns
 */
export async function whoami(client: APIClient): Promise<User> {
	const resp = await client.request<WhoamiResponse>('GET', '/cli/auth/user', WhoamiResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message);
}
