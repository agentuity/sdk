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
			responseFields: [
				{ name: 'firstName', type: 'string', description: "User's first name" },
				{ name: 'lastName', type: 'string', description: "User's last name" },
				{
					name: 'organizations',
					type: 'array',
					description: 'List of organizations the user belongs to',
				},
			],
			statuses: [
				{ code: 200, description: 'User profile returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/auth/user',
		},
	],
};

export default service;
