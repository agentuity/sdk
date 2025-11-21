import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { APIResponseSchema } from '@agentuity/server';
import { abbreviate } from '../../utils/format';

const SessionSchema = z.object({
	id: z.string(),
	startTime: z.string(),
	endTime: z.string().nullable(),
	duration: z.number().nullable(),
	deploymentId: z.string().nullable(),
	agentIds: z.array(z.string()),
	agentNames: z.array(z.string()),
	trigger: z.string().nullable(),
	env: z.string().nullable(),
	devmode: z.boolean(),
	pending: z.boolean(),
	success: z.boolean().nullable(),
	error: z.string().nullable(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	llmCost: z.number().nullable(),
	totalCost: z.number().nullable(),
	createdAt: z.string(),
	evalRuns: z.array(
		z.object({
			id: z.string(),
			evalId: z.string(),
			evalName: z.string(),
			result: z.record(z.string(), z.unknown()).nullable(),
			pending: z.boolean(),
			success: z.boolean().nullable(),
			error: z.string().nullable(),
			createdAt: z.string(),
		})
	),
});

const SessionsResponseSchema = APIResponseSchema(z.array(SessionSchema));

export const sessionsSubcommand = createSubcommand({
	name: 'sessions',
	description: 'Show devmode session results',
	requires: { auth: true, apiClient: true, project: true },
	schema: {
		options: z.object({
			format: z
				.enum(['json', 'table'])
				.optional()
				.default('table')
				.describe('Output format: json or table'),
			agentIdentifier: z.string().optional().describe('Filter sessions by agent identifier'),
			deploymentId: z.string().optional().describe('Filter sessions by deployment ID'),
			verbose: z.boolean().optional().default(false).describe('Show full IDs and descriptions'),
		}),
	},
	async handler(ctx) {
		const { opts, apiClient, project } = ctx;
		const projectId = project.projectId;
		const format = opts?.format ?? 'table';
		const agentIdentifier = opts?.agentIdentifier;
		const deploymentId = opts?.deploymentId;
		const verbose = opts?.verbose ?? false;

		const queryParams = new URLSearchParams();
		if (agentIdentifier) {
			queryParams.set('agentIdentifier', agentIdentifier);
		}
		if (deploymentId) {
			queryParams.set('deploymentId', deploymentId);
		}
		const url = `/cli/session/${projectId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

		const response = await tui.spinner('Fetching sessions', async () => {
			return apiClient.request('GET', url, SessionsResponseSchema);
		});

		if (!response.success) {
			tui.fatal(`Failed to fetch sessions: ${response.message ?? 'Unknown error'}`);
		}

		const sessions = response.data;

		if (format === 'json') {
			console.log(JSON.stringify(sessions, null, 2));
			return;
		}

		tui.info(`Sessions (${sessions.length})`);
		if (sessions.length === 0) {
			tui.muted('No sessions found');
		} else {
			console.table(
				sessions.map((session) => ({
					id: verbose ? session.id : abbreviate(session.id, 20),
					startTime: new Date(session.startTime).toLocaleString(),
					duration: session.duration ? `${(session.duration / 1000).toFixed(2)}s` : 'N/A',
					deployment: abbreviate(session.deploymentId, 20),
					success: session.success === true ? '✓' : session.success === false ? '✗' : '?',
					pending: session.pending ? '⏳' : '✓',
					error: session.error
						? verbose
							? session.error
							: abbreviate(session.error, 20)
						: 'No',
					evalRuns: session.evalRuns.length,
					agents:
						session.agentIds.length > 0
							? session.agentIds
									.map((id, idx) => {
										const name = session.agentNames[idx] || id;
										return verbose
											? `${name} (${id})`
											: `${name} (${abbreviate(id, 20)})`;
									})
									.join(', ')
							: 'None',
				})),
				[
					'id',
					'startTime',
					'duration',
					'deployment',
					'success',
					'pending',
					'error',
					'evalRuns',
					'agents',
				]
			);

			// Show eval runs for each session
			for (const session of sessions) {
				if (session.evalRuns.length > 0) {
					console.log(
						`\n  Eval Runs for session ${verbose ? session.id : abbreviate(session.id, 20)}:`
					);
					console.table(
						session.evalRuns.map((evalRun) => ({
							id: verbose ? evalRun.id : abbreviate(evalRun.id, 20),
							evalName: evalRun.evalName,
							success:
								evalRun.success === true ? '✓' : evalRun.success === false ? '✗' : '?',
							pending: evalRun.pending ? '⏳' : '✓',
							error: evalRun.error
								? verbose
									? evalRun.error
									: abbreviate(evalRun.error, 20)
								: 'No',
							createdAt: new Date(evalRun.createdAt).toLocaleString(),
						})),
						['id', 'evalName', 'success', 'pending', 'error', 'createdAt']
					);
				}
			}
		}
	},
});
