import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api';

const OrganizationSchema = z.object({
	id: z.string().describe('the unique id for the organization'),
	name: z.string().describe('the name of the organization'),
});

const WhoamiResponseSchema = APIResponseSchema(
	z.object({
		firstName: z.string().describe('the first name of the user'),
		lastName: z.string().describe('the last name of the user'),
		organizations: z
			.array(OrganizationSchema)
			.describe('the organizations the user is a member of'),
	})
);

export type WhoamiResponse = z.infer<typeof WhoamiResponseSchema>;
export type User = NonNullable<WhoamiResponse['data']>;

/**
 * Get the current authenticated user information
 *
 * @param client
 * @returns
 */
export async function whoami(client: APIClient): Promise<WhoamiResponse> {
	return client.request<WhoamiResponse>('GET', '/cli/auth/user', WhoamiResponseSchema);
}
