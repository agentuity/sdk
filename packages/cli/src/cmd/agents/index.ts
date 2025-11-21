import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { APIResponseSchema } from '@agentuity/server';
import { Table } from 'console-table-printer';
import { abbreviate, abbreviateDescription } from '../../utils/format';

const AgentSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	identifier: z.string(),
	version: z.string().nullable(),
	deploymentId: z.string().nullable(),
	devmode: z.boolean(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	evals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string().nullable(),
			identifier: z.string().nullable(),
			deploymentId: z.string().nullable(),
			version: z.string().nullable(),
			devmode: z.boolean(),
			createdAt: z.string(),
			updatedAt: z.string(),
		})
	),
});

const AgentsResponseSchema = APIResponseSchema(z.array(AgentSchema));

export const command = createCommand({
	name: 'agents',
	description: 'Show devmode agent results',
	requires: { auth: true, apiClient: true, project: true },
	schema: {
		options: z.object({
			deploymentId: z.string().optional().describe('Filter by deployment ID'),
			format: z
				.enum(['json', 'table'])
				.optional()
				.default('table')
				.describe('Output format: json or table'),
			verbose: z.boolean().optional().default(false).describe('Show full IDs and descriptions'),
		}),
	},
	async handler(ctx) {
		const { opts, apiClient, project } = ctx;
		const projectId = project.projectId;
		const format = opts?.format ?? 'table';
		const verbose = opts?.verbose ?? false;

		const deploymentId = opts?.deploymentId;
		const queryParams = deploymentId ? `?deploymentId=${deploymentId}` : '';
		const response = await tui.spinner('Fetching agents', async () => {
			return apiClient.request(
				'GET',
				`/cli/agent/${projectId}${queryParams}`,
				AgentsResponseSchema
			);
		});

		if (!response.success) {
			tui.fatal(`Failed to fetch agents: ${response.message ?? 'Unknown error'}`);
		}

		const agents = response.data;

		if (format === 'json') {
			console.log(JSON.stringify(agents, null, 2));
			return;
		}

		tui.info(`Agents (${agents.length})`);
		if (agents.length === 0) {
			tui.muted('No agents found');
		} else {
			const table = new Table({
				columns: [
					{ name: 'Name', alignment: 'left' },
					{ name: 'ID', alignment: 'left' },
					{ name: 'Identifier', alignment: 'left' },
					{ name: 'Deployment', alignment: 'left' },
					{ name: 'Version', alignment: 'left' },
					{ name: 'Evals', alignment: 'center' },
					{ name: 'Created', alignment: 'left' },
				],
			});

			for (const agent of agents) {
				table.addRow({
					Name: agent.name,
					ID: verbose ? agent.id : abbreviate(agent.id, 20),
					Identifier: verbose ? agent.identifier : abbreviate(agent.identifier, 20),
					Deployment: abbreviate(agent.deploymentId, 20),
					Version: verbose
						? (agent.version ?? 'N/A')
						: (abbreviate(agent.version, 20) ?? 'N/A'),
					Evals: agent.evals.length,
					Created: new Date(agent.createdAt).toLocaleString(),
				});
			}
			table.printTable();

			// Show evals for each agent
			for (const agent of agents) {
				if (agent.evals.length > 0) {
					console.log(`\n  Evals for ${agent.name}:`);
					const evalTable = new Table({
						columns: [
							{ name: 'Name', alignment: 'left' },
							{ name: 'ID', alignment: 'left' },
							{ name: 'Identifier', alignment: 'left' },
							{ name: 'Deployment', alignment: 'left' },
							{ name: 'Version', alignment: 'left' },
							{ name: 'Description', alignment: 'left' },
							{ name: 'Created', alignment: 'left' },
						],
					});

					for (const evalItem of agent.evals) {
						evalTable.addRow({
							Name: evalItem.name,
							ID: verbose ? evalItem.id : abbreviate(evalItem.id, 20),
							Identifier: verbose
								? (evalItem.identifier ?? 'N/A')
								: (abbreviate(evalItem.identifier, 20) ?? 'N/A'),
							Deployment: abbreviate(evalItem.deploymentId, 20),
							Version: verbose
								? (evalItem.version ?? 'N/A')
								: (abbreviate(evalItem.version, 20) ?? 'N/A'),
							Description: verbose
								? (evalItem.description ?? 'N/A')
								: abbreviateDescription(evalItem.description),
							Created: new Date(evalItem.createdAt).toLocaleString(),
						});
					}
					evalTable.printTable();
				}
			}
		}
	},
});
