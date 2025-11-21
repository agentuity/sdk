import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { APIResponseSchema } from '@agentuity/server';
import { Table } from 'console-table-printer';
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

export const command = createCommand({
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
			const table = new Table({
				columns: [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Start Time', alignment: 'left' },
					{ name: 'Duration', alignment: 'left' },
					{ name: 'Deployment', alignment: 'left' },
					{ name: 'Success', alignment: 'center' },
					{ name: 'Pending', alignment: 'center' },
					{ name: 'Error', alignment: 'center' },
					{ name: 'Eval Runs', alignment: 'center' },
					{ name: 'Agents', alignment: 'left' },
				],
			});

			for (const session of sessions) {
				table.addRow({
					ID: verbose ? session.id : abbreviate(session.id, 20),
					'Start Time': new Date(session.startTime).toLocaleString(),
					Duration: session.duration ? `${(session.duration / 1000).toFixed(2)}s` : 'N/A',
					Deployment: abbreviate(session.deploymentId, 20),
					Success: session.success === true ? '✓' : session.success === false ? '✗' : '?',
					Pending: session.pending ? '⏳' : '✓',
					Error: session.error
						? verbose
							? session.error
							: abbreviate(session.error, 20)
						: 'No',
					'Eval Runs': session.evalRuns.length,
					Agents:
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
				});
			}
			table.printTable();

			// Show eval runs for each session
			for (const session of sessions) {
				if (session.evalRuns.length > 0) {
					console.log(
						`\n  Eval Runs for session ${verbose ? session.id : abbreviate(session.id, 20)}:`
					);
					const evalTable = new Table({
						columns: [
							{ name: 'ID', alignment: 'left' },
							{ name: 'Eval Name', alignment: 'left' },
							{ name: 'Success', alignment: 'center' },
							{ name: 'Pending', alignment: 'center' },
							{ name: 'Error', alignment: 'center' },
							{ name: 'Created', alignment: 'left' },
						],
					});

					for (const evalRun of session.evalRuns) {
						evalTable.addRow({
							ID: verbose ? evalRun.id : abbreviate(evalRun.id, 20),
							'Eval Name': evalRun.evalName,
							Success:
								evalRun.success === true ? '✓' : evalRun.success === false ? '✗' : '?',
							Pending: evalRun.pending ? '⏳' : '✓',
							Error: evalRun.error
								? verbose
									? evalRun.error
									: abbreviate(evalRun.error, 20)
								: 'No',
							Created: new Date(evalRun.createdAt).toLocaleString(),
						});
					}
					evalTable.printTable();
				}
			}
		}
	},
});
