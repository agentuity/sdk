import { WhoamiResponse } from './whoami.ts';
import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Users',
	slug: 'user',
	description: 'Get authenticated user information and organization memberships',
	endpoints: [
		{
			id: 'get-current-user',
			title: 'Get Current User',
			method: 'GET',
			path: '/cli/auth/user',
			description:
				"Retrieve the authenticated user's profile including name and organization memberships.",
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription:
				"Returns the authenticated user's profile including name and organization memberships.",
			responseFields: { schema: WhoamiResponse },
			statuses: [
				{ code: 200, description: 'User profile returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/auth/user',
		},
	],
};

export default service;
