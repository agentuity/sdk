import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';
import { getCommand } from '../../command-prefix';

const ProjectShowResponseSchema = z.object({
	id: z.string().describe('Project ID'),
	name: z.string().describe('Project name'),
	description: z.string().nullable().optional().describe('Project description'),
	tags: z.array(z.string()).nullable().optional().describe('Project tags'),
	orgId: z.string().describe('Organization ID'),
	secrets: z.record(z.string(), z.string()).optional().describe('Project secrets (masked)'),
	env: z.record(z.string(), z.string()).optional().describe('Environment variables'),
});

export const showSubcommand = createSubcommand({
	name: 'show',
	aliases: ['get'],
	description: 'Show project detail',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-project'],
	requires: { auth: true, apiClient: true },
	examples: [
		{ command: getCommand('project show proj_abc123def456'), description: 'Show details' },
		{
			command: getCommand('--json project show proj_abc123def456'),
			description: 'Show output in JSON format',
		},
		{ command: getCommand('project get proj_abc123def456'), description: 'Get item details' },
	],
	schema: {
		args: z.object({
			id: z.string().describe('the project id'),
		}),
		response: ProjectShowResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, apiClient, options } = ctx;

		const project = await tui.spinner('Fetching project', () => {
			return projectGet(apiClient, { id: args.id, mask: true });
		});

		if (!project) {
			tui.fatal('Project not found');
		}

		if (!options.json) {
			tui.table([project], ['id', 'name', 'description', 'tags', 'orgId']);
		}

		return {
			id: project.id,
			name: project.name,
			description: project.description,
			tags: project.tags,
			orgId: project.orgId,
			secrets: project.secrets,
			env: project.env,
		};
	},
});
