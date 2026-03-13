import type { Service } from '../api-reference.ts';
import { EvaluationSchema } from './list.ts';
import { EvalRunSchema } from './run-list.ts';

const service: Service = {
	name: 'Evaluations',
	slug: 'evaluations',
	description: 'List and retrieve evaluations and their run history',
	endpoints: [
		{
			id: 'list-evaluations',
			title: 'List Evaluations',
			method: 'GET',
			path: '/cli/eval',
			description:
				'List evaluations with optional filtering by organization, project, or agent.',
			pathParams: [],
			queryParams: [
				{
					name: 'orgId',
					type: 'string',
					description: 'Filter by organization ID',
					required: false,
				},
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project ID',
					required: false,
				},
				{ name: 'agentId', type: 'string', description: 'Filter by agent ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Array of evaluation objects.',
			responseFields: { schema: EvaluationSchema },
			statuses: [
				{ code: 200, description: 'Evaluations returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/eval',
		},
		{
			id: 'get-evaluation',
			title: 'Get Evaluation',
			method: 'GET',
			path: '/cli/eval/{id}',
			description: 'Get a specific evaluation by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'Evaluation ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Evaluation object.',
			statuses: [
				{ code: 200, description: 'Evaluation returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Evaluation not found' },
			],
			examplePath: '/cli/eval/eval_abc123',
		},
		{
			id: 'list-eval-runs',
			title: 'List Eval Runs',
			sectionTitle: 'Eval Runs',
			method: 'GET',
			path: '/cli/eval-run',
			description: 'List evaluation runs with optional filtering.',
			pathParams: [],
			queryParams: [
				{
					name: 'orgId',
					type: 'string',
					description: 'Filter by organization ID',
					required: false,
				},
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project ID',
					required: false,
				},
				{ name: 'agentId', type: 'string', description: 'Filter by agent ID', required: false },
				{
					name: 'evalId',
					type: 'string',
					description: 'Filter by evaluation ID',
					required: false,
				},
				{
					name: 'sessionId',
					type: 'string',
					description: 'Filter by session ID',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Array of evaluation run objects.',
			responseFields: { schema: EvalRunSchema },
			statuses: [
				{ code: 200, description: 'Eval runs returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
			],
			examplePath: '/cli/eval-run',
		},
		{
			id: 'get-eval-run',
			title: 'Get Eval Run',
			sectionTitle: 'Eval Runs',
			method: 'GET',
			path: '/cli/eval-run/{id}',
			description: 'Get a specific evaluation run by ID.',
			pathParams: [{ name: 'id', type: 'string', description: 'Eval run ID', required: true }],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Evaluation run object.',
			statuses: [
				{ code: 200, description: 'Eval run returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing Bearer token' },
				{ code: 404, description: 'Eval run not found' },
			],
			examplePath: '/cli/eval-run/er_abc123',
		},
	],
};

export default service;
