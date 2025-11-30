import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectAgentList } from '@agentuity/server';
import Table from 'cli-table3';
import { abbreviate, abbreviateDescription } from '../../../utils/format';
import { getCommand } from '../../../command-prefix';
import { AgentSchema } from './schema';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List agents for a project',
	aliases: ['ls'],
	requires: { auth: true, apiClient: true, project: true },
	examples: [
		{ command: getCommand('cloud agent list'), description: 'List items' },
		{ command: getCommand('cloud agent list --verbose'), description: 'Use verbose option' },
		{ command: getCommand('--json cloud agent list'), description: 'Show output in JSON format' },
	],
	schema: {
		options: z.object({
			deploymentId: z.string().optional().describe('Filter by deployment ID'),
			verbose: z.boolean().optional().default(false).describe('Show full descriptions'),
		}),
		response: z.array(AgentSchema),
	},
	async handler(ctx) {
		const { opts, apiClient, project, options } = ctx;
		const projectId = project.projectId;
		const verbose = opts?.verbose ?? false;

		const agents = await tui.spinner({
			message: 'Fetching agents',
			clearOnSuccess: true,
			callback: async () => {
				return projectAgentList(apiClient, projectId, {
					deploymentId: opts?.deploymentId,
				});
			},
		});

		if (options.json) {
			return agents;
		}

		tui.info(`Agents (${agents.length})`);
		if (agents.length === 0) {
			console.log(tui.muted('No agents found'));
		} else {
			const table = new Table({
				head: [
					tui.heading('Name'),
					tui.heading('ID'),
					tui.heading('Description'),
					tui.heading('Evals'),
					tui.heading('Created'),
				],
				colAligns: ['left', 'left', 'left', 'center', 'left'],
				wordWrap: true,
			});

			for (const agent of agents) {
				table.push([
					agent.name,
					agent.identifier,
					verbose ? (agent.description ?? 'N/A') : abbreviateDescription(agent.description),
					agent.evals.length,
					new Date(agent.createdAt).toLocaleString(),
				]);
			}
			console.log(table.toString());

			// Show evals for each agent
			for (const agent of agents) {
				if (agent.evals.length > 0) {
					console.log(`\n  Evals for ${agent.name}:`);
					const evalTable = new Table({
						head: [
							tui.heading('Name'),
							tui.heading('ID'),
							tui.heading('Description'),
							tui.heading('Created'),
						],
						colAligns: ['left', 'left', 'left', 'left'],
						wordWrap: true,
					});

					for (const evalItem of agent.evals) {
						evalTable.push([
							evalItem.name,
							verbose
								? (evalItem.identifier ?? 'N/A')
								: (abbreviate(evalItem.identifier, 20) ?? 'N/A'),
							verbose
								? (evalItem.description ?? 'N/A')
								: abbreviateDescription(evalItem.description),
							new Date(evalItem.createdAt).toLocaleString(),
						]);
					}
					console.log(evalTable.toString());
				}
			}
		}

		return agents;
	},
});
