import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Schedules',
	slug: 'schedules',
	description:
		'Create and manage cron-based scheduled jobs with destinations and delivery tracking',
	endpoints: [
		{
			id: 'create-schedule',
			title: 'Create Schedule',
			sectionTitle: 'Schedule Management',
			method: 'POST',
			path: '/schedule/create',
			description: 'Create a new cron-based schedule with optional destinations.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Schedule creation payload.',
				fields: [
					{ name: 'name', type: 'string', description: 'Schedule name', required: true },
					{
						name: 'description',
						type: 'string',
						description: 'Schedule description',
						required: false,
					},
					{
						name: 'expression',
						type: 'string',
						description: 'Cron expression',
						required: true,
					},
					{
						name: 'destinations',
						type: 'array',
						description: "Array of { type: 'url'|'sandbox', config }",
						required: false,
					},
				],
			},
			responseDescription: 'Returns the created schedule and its destinations.',
			responseFields: [
				{ name: 'schedule', type: 'object', description: 'The created schedule' },
				{ name: 'destinations', type: 'array', description: 'Associated destinations' },
			],
			statuses: [
				{ code: 201, description: 'Schedule created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/schedule/create',
			exampleBody: {
				name: 'Daily Report',
				expression: '0 9 * * *',
				destinations: [{ type: 'url', config: { url: 'https://example.com/webhook' } }],
			},
		},
		{
			id: 'list-schedules',
			title: 'List Schedules',
			sectionTitle: 'Schedule Management',
			method: 'GET',
			path: '/schedule/list',
			description: 'List all schedules with optional pagination.',
			pathParams: [],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Max results (max 500)',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of schedules.',
			responseFields: [
				{ name: 'schedules', type: 'array', description: 'List of schedule objects' },
				{ name: 'total', type: 'number', description: 'Total number of schedules' },
			],
			statuses: [
				{ code: 200, description: 'Schedules returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/schedule/list',
		},
		{
			id: 'get-schedule',
			title: 'Get Schedule',
			sectionTitle: 'Schedule Management',
			method: 'GET',
			path: '/schedule/get/{scheduleId}',
			description: 'Get a specific schedule by ID.',
			pathParams: [
				{
					name: 'scheduleId',
					type: 'string',
					description: 'Schedule ID (sch_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns the schedule object.',
			statuses: [
				{ code: 200, description: 'Schedule returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/get/sch_abc123',
		},
		{
			id: 'update-schedule',
			title: 'Update Schedule',
			sectionTitle: 'Schedule Management',
			method: 'PUT',
			path: '/schedule/update/{scheduleId}',
			description: "Update a schedule's name, description, or cron expression.",
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Fields to update.',
				fields: [
					{
						name: 'name',
						type: 'string',
						description: 'Updated schedule name',
						required: false,
					},
					{
						name: 'description',
						type: 'string',
						description: 'Updated description',
						required: false,
					},
					{
						name: 'expression',
						type: 'string',
						description: 'Updated cron expression',
						required: false,
					},
				],
			},
			responseDescription: 'Returns the updated schedule.',
			statuses: [
				{ code: 200, description: 'Schedule updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/update/sch_abc123',
			exampleBody: { expression: '0 */6 * * *' },
		},
		{
			id: 'delete-schedule',
			title: 'Delete Schedule',
			sectionTitle: 'Schedule Management',
			method: 'DELETE',
			path: '/schedule/delete/{scheduleId}',
			description: 'Delete a schedule and all associated destinations and delivery history.',
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Deletes the schedule and all associated destinations and delivery history.',
			statuses: [
				{ code: 204, description: 'Schedule deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/delete/sch_abc123',
		},
		{
			id: 'create-schedule-destination',
			title: 'Create Destination',
			sectionTitle: 'Destinations',
			method: 'POST',
			path: '/schedule/destinations/create/{scheduleId}',
			description: 'Add a destination to a schedule.',
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [],
			requestBody: {
				description: 'Destination creation payload.',
				fields: [
					{ name: 'type', type: 'string', description: "'url' or 'sandbox'", required: true },
					{
						name: 'config',
						type: 'object',
						description: 'Destination config — for url: { url, headers?, method? }',
						required: true,
					},
				],
			},
			responseDescription: 'Returns the created destination.',
			statuses: [
				{ code: 201, description: 'Destination created' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/destinations/create/sch_abc123',
			exampleBody: {
				type: 'url',
				config: { url: 'https://example.com/callback', method: 'POST' },
			},
		},
		{
			id: 'delete-schedule-destination',
			title: 'Delete Destination',
			sectionTitle: 'Destinations',
			method: 'DELETE',
			path: '/schedule/destinations/delete/{destinationId}',
			description: 'Delete a destination from a schedule.',
			pathParams: [
				{
					name: 'destinationId',
					type: 'string',
					description: 'Destination ID (sdst_ prefix)',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Destination deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Destination not found' },
			],
			examplePath: '/schedule/destinations/delete/sdst_abc123',
		},
		{
			id: 'list-schedule-deliveries',
			title: 'List Deliveries',
			sectionTitle: 'Deliveries',
			method: 'GET',
			path: '/schedule/deliveries/{scheduleId}',
			description: 'List delivery attempts for a schedule.',
			pathParams: [
				{ name: 'scheduleId', type: 'string', description: 'Schedule ID', required: true },
			],
			queryParams: [
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns delivery attempts with status, retries, and error details.',
			statuses: [
				{ code: 200, description: 'Deliveries returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Schedule not found' },
			],
			examplePath: '/schedule/deliveries/sch_abc123',
		},
	],
};

export default service;
