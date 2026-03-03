import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectList } from '@agentuity/server';
import { getCommand } from '../../command-prefix';
import { z } from 'zod';

const ProjectListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Project ID'),
		name: z.string().describe('Project name'),
		orgId: z.string().describe('Organization ID'),
		orgName: z.string().describe('Organization name'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List all projects',
	tags: ['read-only', 'slow', 'requires-auth'],
	aliases: ['ls'],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		response: ProjectListResponseSchema,
	},
	examples: [
		{ command: getCommand('project list'), description: 'List projects (human-readable)' },
		{ command: getCommand('--json project list'), description: 'List projects in JSON format' },
		{
			command: getCommand('project ls'),
			description: 'Alias for "project list" — list projects (human-readable)',
		},
	],
	webUrl: '/projects',

	async handler(ctx) {
		const { apiClient, options } = ctx;

		const projects = await tui.spinner({
			message: 'Fetching projects',
			clearOnSuccess: true,
			callback: () => {
				return projectList(apiClient);
			},
		});

		// Projects are sorted by createdAt (most recent first) from the API

		if (!options.json) {
			tui.table(projects, ['id', 'name', 'orgName']);
		}

		return projects ?? [];
	},
});
