import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { threadGet, APIError } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getCatalystAPIClient } from '../../../config';

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
	requires: { auth: true, region: true },
	idempotent: true,
	schema: {
		args: z.object({
			thread_id: z.string().describe('Thread ID'),
		}),
		response: ThreadGetResponseSchema,
	},
	async handler(ctx) {
		const { logger, auth, args, options, region } = ctx;
		const catalystClient = getCatalystAPIClient(logger, auth, region);

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

			console.log(tui.bold('ID:          ') + thread.id);
			console.log(tui.bold('Project:     ') + thread.project_id);
			console.log(tui.bold('Created:     ') + new Date(thread.created_at).toLocaleString());
			console.log(tui.bold('Updated:     ') + new Date(thread.updated_at).toLocaleString());
			console.log(tui.bold('Deleted:     ') + (thread.deleted ? 'Yes' : 'No'));
			if (thread.deleted_at) {
				console.log(tui.bold('Deleted At:  ') + new Date(thread.deleted_at).toLocaleString());
			}
			if (thread.deleted_by) {
				console.log(tui.bold('Deleted By:  ') + thread.deleted_by);
			}
			if (thread.user_data) {
				console.log(tui.bold('User Data:   ') + thread.user_data);
			}

			return result;
		} catch (ex) {
			if (ex instanceof APIError && ex.status === 404) {
				tui.fatal(`Thread ${args.thread_id} not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			tui.fatal(`Failed to get thread: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
