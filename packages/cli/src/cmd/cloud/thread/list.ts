import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { threadList, type Thread } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getCatalystAPIClient } from '../../../config';

const ThreadListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Thread ID'),
		created_at: z.string().describe('Creation timestamp'),
		updated_at: z.string().describe('Update timestamp'),
		project_id: z.string().describe('Project ID'),
		user_data: z.string().nullable().optional().describe('User data as JSON'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List recent threads',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud thread list'), description: 'List 10 most recent threads' },
		{
			command: getCommand('cloud thread list --count=25'),
			description: 'List 25 most recent threads',
		},
		{
			command: getCommand('cloud thread list --project-id=proj_*'),
			description: 'Filter by project',
		},
		{
			command: getCommand('cloud thread list --org-id=org_*'),
			description: 'Filter by organization',
		},
	],
	aliases: ['ls'],
	requires: { auth: true },
	optional: { project: true },
	idempotent: true,
	pagination: {
		supported: true,
		defaultLimit: 10,
		maxLimit: 100,
		parameters: {
			limit: 'count',
		},
	},
	schema: {
		options: z.object({
			count: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(10)
				.describe('Number of threads to list (1–100)'),
			orgId: z.string().optional().describe('Filter by organization ID'),
			projectId: z.string().optional().describe('Filter by project ID'),
		}),
		response: ThreadListResponseSchema,
	},
	async handler(ctx) {
		const { config, logger, auth, project, opts, options } = ctx;
		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const projectId = opts.projectId || project?.projectId;
		const orgId = opts.orgId;

		try {
			const threads = await threadList(catalystClient, {
				count: opts.count,
				orgId,
				projectId,
			});

			const result = threads.map((t: Thread) => ({
				id: t.id,
				created_at: t.created_at,
				updated_at: t.updated_at,
				project_id: t.project_id,
				user_data: t.user_data,
			}));

			if (options.json) {
				return result;
			}

			if (threads.length === 0) {
				tui.info('No threads found.');
				return [];
			}

			const tableData = threads.map((t: Thread) => {
				return {
					ID: t.id,
					Project: t.project_id,
					Created: new Date(t.created_at).toLocaleString(),
					Updated: new Date(t.updated_at).toLocaleString(),
					'User Data': t.user_data
						? t.user_data.length > 50
							? t.user_data.substring(0, 47) + '...'
							: t.user_data
						: '-',
				};
			});

			tui.table(tableData, [
				{ name: 'ID', alignment: 'left' },
				{ name: 'Project', alignment: 'left' },
				{ name: 'Created', alignment: 'left' },
				{ name: 'Updated', alignment: 'left' },
				{ name: 'User Data', alignment: 'left' },
			]);

			return result;
		} catch (ex) {
			tui.fatal(`Failed to list threads: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
