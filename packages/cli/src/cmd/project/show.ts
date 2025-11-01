import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';

export const showSubcommand = createSubcommand({
	name: 'show',
	aliases: ['get'],
	description: 'Show project detail',
	requiresAuth: true,
	requiresAPIClient: true,
	schema: {
		args: z.object({
			id: z.string().describe('the project id'),
		}),
		options: z.object({
			format: z
				.enum(['json', 'table'])
				.optional()
				.describe('the output format: json, table (default)'),
		}),
	},

	async handler(ctx) {
		const { opts, args, apiClient } = ctx;

		const project = await tui.spinner('Fetching project', () => {
			return projectGet(apiClient, { id: args.id, mask: true });
		});

		if (!project) {
			tui.fatal('Project not found');
		}

		if (opts?.format === 'json') {
			console.log(JSON.stringify(project, null, 2));
		} else {
			console.table([project], ['id', 'orgId']);
		}
	},
});
