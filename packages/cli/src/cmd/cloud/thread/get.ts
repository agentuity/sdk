import { APIError, threadGet } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { getGlobalCatalystAPIClient } from '../../../config';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';

const ThreadGetResponseSchema = z.object({
	id: z.string().describe('Thread ID'),
	created_at: z.string().describe('Creation timestamp'),
	updated_at: z.string().describe('Update timestamp'),
	deleted: z.boolean().describe('Deleted status'),
	deleted_at: z.string().nullable().describe('Deletion timestamp'),
	deleted_by: z.string().nullable().describe('Deleted by'),
	org_id: z.string().describe('Organization ID'),
	project_id: z.string().describe('Project ID'),
	user_data: z.string().nullable().optional().describe('User data as JSON'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get details about a specific thread',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud thread get thrd_abc123xyz'),
			description: 'Get a thread by ID',
		},
	],
	requires: { auth: true },
	idempotent: true,
	schema: {
		args: z.object({
			thread_id: z.string().describe('Thread ID'),
		}),
		response: ThreadGetResponseSchema,
	},
	async handler(ctx) {
		const { logger, auth, args, options, config } = ctx;
		const catalystClient = await getGlobalCatalystAPIClient(
			logger,
			auth,
			config?.name,
			undefined,
			config
		);

		try {
			const thread = await threadGet(catalystClient, { id: args.thread_id });

			const result = {
				id: thread.id,
				created_at: thread.created_at,
				updated_at: thread.updated_at,
				deleted: thread.deleted,
				deleted_at: thread.deleted_at,
				deleted_by: thread.deleted_by,
				org_id: thread.org_id,
				project_id: thread.project_id,
				user_data: thread.user_data,
			};

			if (options.json) {
				return result;
			}

			const tableData: Record<string, string> = {
				ID: thread.id,
				Project: thread.project_id,
				Created: new Date(thread.created_at).toLocaleString(),
				Updated: new Date(thread.updated_at).toLocaleString(),
				Deleted: thread.deleted ? 'Yes' : 'No',
			};
			if (thread.deleted_at) {
				tableData['Deleted At'] = new Date(thread.deleted_at).toLocaleString();
			}
			if (thread.deleted_by) {
				tableData['Deleted By'] = thread.deleted_by;
			}
			if (thread.user_data) {
				tableData['User Data'] = thread.user_data;
			}

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });

			return result;
		} catch (ex) {
			if (ex instanceof APIError && ex.status === 404) {
				tui.fatal(`Thread ${args.thread_id} not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			tui.fatal(`Failed to get thread: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
