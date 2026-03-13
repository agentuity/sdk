import { MachineSchema } from './machine.ts';
import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Machines',
	slug: 'machines',
	description: 'Manage compute nodes and organization authentication enrollment',
	endpoints: [
		{
			id: 'list-machines',
			title: 'List Machines',
			sectionTitle: 'Machine Management',
			method: 'GET',
			path: '/machine',
			description: 'List all machines visible to the authenticated user.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns all machines visible to the authenticated user.',
			statuses: [
				{ code: 200, description: 'Machines returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/machine',
		},
		{
			id: 'get-machine',
			title: 'Get Machine',
			sectionTitle: 'Machine Management',
			method: 'GET',
			path: '/machine/{machineId}',
			description: 'Get details for a specific machine.',
			pathParams: [
				{ name: 'machineId', type: 'string', description: 'Machine ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns machine details.',
			responseFields: { schema: MachineSchema },
			statuses: [
				{ code: 200, description: 'Machine returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Machine not found' },
			],
			examplePath: '/machine/mch_abc123',
		},
		{
			id: 'delete-machine',
			title: 'Delete Machine',
			sectionTitle: 'Machine Management',
			method: 'DELETE',
			path: '/machine/{machineId}',
			description: 'Delete a machine by ID.',
			pathParams: [
				{ name: 'machineId', type: 'string', description: 'Machine ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Machine deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Machine not found' },
			],
			examplePath: '/machine/mch_abc123',
		},
		{
			id: 'list-machine-deployments',
			title: 'List Machine Deployments',
			sectionTitle: 'Machine Management',
			method: 'GET',
			path: '/machine/deployments/{machineId}',
			description: 'List all deployments currently running on a specific machine.',
			pathParams: [
				{ name: 'machineId', type: 'string', description: 'Machine ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns all deployments currently running on the specified machine.',
			statuses: [
				{ code: 200, description: 'Deployments returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Machine not found' },
			],
			examplePath: '/machine/deployments/mch_abc123',
		},
		{
			id: 'enroll-organization',
			title: 'Enroll Organization',
			sectionTitle: 'Auth Enrollment',
			method: 'POST',
			path: '/cli/auth/org/enroll',
			description: 'Enroll an organization for machine authentication.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Enrollment payload with organization ID and public key.',
				fields: [
					{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
					{
						name: 'publicKey',
						type: 'string',
						description: 'Public key for machine authentication',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the enrolled organization ID.',
			responseFields: [
				{ name: 'orgId', type: 'string', description: 'The enrolled organization ID' },
			],
			statuses: [
				{ code: 200, description: 'Organization enrolled' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/auth/org/enroll',
			exampleBody: { orgId: 'org_abc123', publicKey: 'ssh-ed25519 AAAA...' },
		},
		{
			id: 'get-enrollment-status',
			title: 'Get Enrollment Status',
			sectionTitle: 'Auth Enrollment',
			method: 'GET',
			path: '/cli/auth/org/status/{orgId}',
			description: 'Get the enrollment status for an organization.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the enrollment status. A null publicKey means not enrolled.',
			responseFields: [
				{
					name: 'publicKey',
					type: 'string | null',
					description: 'Public key or null if not enrolled',
				},
			],
			statuses: [
				{ code: 200, description: 'Enrollment status returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization not found' },
			],
			examplePath: '/cli/auth/org/status/org_abc123',
		},
		{
			id: 'unenroll-organization',
			title: 'Unenroll Organization',
			sectionTitle: 'Auth Enrollment',
			method: 'DELETE',
			path: '/cli/auth/org/unenroll/{orgId}',
			description: 'Remove enrollment for an organization.',
			pathParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Organization unenrolled' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Organization not found' },
			],
			examplePath: '/cli/auth/org/unenroll/org_abc123',
		},
	],
};

export default service;
