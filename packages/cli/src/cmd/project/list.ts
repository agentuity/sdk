import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectList } from '@agentuity/server';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List all projects',
	aliases: ['ls'],
	requires: { auth: true, apiClient: true },
	schema: {
		options: z.object({
			format: z
				.enum(['json', 'table'])
				.optional()
				.describe('the output format: json, table (default)'),
		}),
	},

	async handler(ctx) {
		const { apiClient, opts } = ctx;

		const projects = await tui.spinner('Fetching projects', () => {
			return projectList(apiClient);
		});

		// TODO: might want to sort by the last org_id we used
		if (projects) {
			projects.sort((a, b) => {
				return a.name.localeCompare(b.name);
			});
		}

		if (opts?.format === 'json') {
			console.log(JSON.stringify(projects, null, 2));
		} else {
			console.table(projects, ['id', 'name', 'orgName']);
		}
	},
});
