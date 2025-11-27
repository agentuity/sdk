import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { APIResponseSchema } from '@agentuity/server';
import { abbreviate, abbreviateDescription } from '../../utils/format';

const AgentSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	identifier: z.string().nullable(), // nullable for legacy records
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

export const agentsSubcommand = createSubcommand({
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
		response: z.array(AgentSchema),
	},
	async handler(ctx) {
		const { opts, apiClient, project, options } = ctx;
		const projectId = project.projectId;
		const format = opts?.format ?? 'table';
		const verbose = opts?.verbose ?? false;

		const deploymentId = opts?.deploymentId;
		const queryParams = deploymentId ? `?deploymentId=${deploymentId}` : '';

		const response = options.json
			? await apiClient.request(
					'GET',
					`/cli/agent/${projectId}${queryParams}`,
					AgentsResponseSchema
				)
			: await tui.spinner('Fetching agents', async () => {
					return apiClient.request(
						'GET',
						`/cli/agent/${projectId}${queryParams}`,
						AgentsResponseSchema
					);
				});

		if (!response.success) {
			tui.fatal(`Failed to fetch agents: ${response.message ?? 'Unknown error'}`);
		}

		// Filter out legacy agents without identifiers
		const agents = response.data.filter((agent) => agent.identifier !== null);

		if (format === 'json' && !options.json) {
			console.log(JSON.stringify(agents, null, 2));
			return agents;
		}

		if (!options.json) {
			tui.info(`Agents (${agents.length})`);
			if (agents.length === 0) {
				tui.muted('No agents found');
			} else {
				console.table(
					agents.map((agent) => ({
						name: agent.name,
						id: verbose ? agent.id : abbreviate(agent.id, 20),
						identifier: verbose ? agent.identifier! : abbreviate(agent.identifier!, 20),
						deployment: abbreviate(agent.deploymentId, 20),
						version: verbose
							? (agent.version ?? 'N/A')
							: (abbreviate(agent.version, 20) ?? 'N/A'),
						evals: agent.evals.length,
						createdAt: new Date(agent.createdAt).toLocaleString(),
					})),
					['name', 'id', 'identifier', 'deployment', 'version', 'evals', 'createdAt']
				);

				// Show evals for each agent
				for (const agent of agents) {
					if (agent.evals.length > 0) {
						console.log(`\n  Evals for ${agent.name}:`);
						console.table(
							agent.evals.map((evalItem) => ({
								name: evalItem.name,
								id: verbose ? evalItem.id : abbreviate(evalItem.id, 20),
								identifier: verbose
									? (evalItem.identifier ?? 'N/A')
									: (abbreviate(evalItem.identifier, 20) ?? 'N/A'),
								deployment: abbreviate(evalItem.deploymentId, 20),
								version: verbose
									? (evalItem.version ?? 'N/A')
									: (abbreviate(evalItem.version, 20) ?? 'N/A'),
								description: verbose
									? (evalItem.description ?? 'N/A')
									: abbreviateDescription(evalItem.description),
								createdAt: new Date(evalItem.createdAt).toLocaleString(),
							})),
							[
								'name',
								'id',
								'identifier',
								'deployment',
								'version',
								'description',
								'createdAt',
							]
						);
					}
				}
			}
		}

		return agents;
	},
});
