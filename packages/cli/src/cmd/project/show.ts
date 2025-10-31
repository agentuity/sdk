import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';

export const showSubcommand = createSubcommand({
	name: 'show',
	aliases: ['get'],
	description: 'Show project detail',
	requiresAuth: true,
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
		const { opts, args, config } = ctx;

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		const project = await tui.spinner('Fetching project', () => {
			return projectGet(client!, { id: args.id, mask: true });
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
