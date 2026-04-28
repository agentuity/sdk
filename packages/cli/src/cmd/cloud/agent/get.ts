import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectAgentGet } from '@agentuity/server';
import Table from 'cli-table3';
import { getCommand } from '../../../command-prefix.ts';
import { AgentSchema } from './schema.ts';

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get details about a specific agent',
	requires: { auth: true, apiClient: true, project: true },
	examples: [
		{ command: getCommand('cloud agent get agent_abc123'), description: 'Get item details' },
		{
			command: getCommand('--json cloud agent get agent_abc123'),
			description: 'Show output in JSON format',
		},
	],
	schema: {
		args: z.object({
			agent_id: z.string().describe('Agent identifier'),
		}),
		response: AgentSchema,
	},
	webUrl: (ctx) =>
		`/projects/${encodeURIComponent(ctx.project.projectId)}/agents/${encodeURIComponent(ctx.args.agent_id)}`,
	async handler(ctx) {
		const { args, apiClient, project, options } = ctx;
		const agentId = args.agent_id;
		const projectId = project.projectId;

		const agent = await tui.spinner({
			message: 'Fetching agent details',
			clearOnSuccess: true,
			callback: async () => {
				return projectAgentGet(apiClient, projectId, agentId);
			},
		});

		if (options.json) {
			return agent;
		}

		// Display agent details
		tui.table(
			[
				{
					ID: agent.identifier,
					Name: agent.name,
					Description: agent.description || 'N/A',
					'Dev Mode': agent.devmode ? 'Yes' : 'No',
					Created: new Date(agent.createdAt).toLocaleString(),
					Updated: new Date(agent.updatedAt).toLocaleString(),
				},
			],
			['ID', 'Name', 'Description', 'Dev Mode', 'Created', 'Updated'],
			{ layout: 'vertical', padStart: '  ' }
		);

		// Display metadata if present
		if (agent.metadata && Object.keys(agent.metadata).length > 0) {
			tui.newline();
			tui.info('Metadata');
			for (const [key, value] of Object.entries(agent.metadata)) {
				let v = value;
				switch (typeof v) {
					case 'string': {
						v = value as string;
						break;
					}
					case 'boolean': {
						v = value ? 'true' : 'false';
						break;
					}
					case 'number': {
						v = String(value);
						break;
					}
					default: {
						v = JSON.stringify(value);
						break;
					}
				}
				console.log(`  ${(key + ':').padEnd(15, ' ')} ${v}`);
			}
		}

		// Display evals if present
		if (agent.evals.length > 0) {
			tui.newline();
			tui.info(`Evaluations (${agent.evals.length})`);
			const evalsTable = new Table({
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
				evalsTable.push([
					evalItem.name,
					evalItem.identifier ?? 'N/A',
					evalItem.description ?? 'N/A',
					new Date(evalItem.createdAt).toLocaleString(),
				]);
			}

			console.log(evalsTable.toString());
		}

		return agent;
	},
});
