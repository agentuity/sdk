import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { threadDelete, APIError } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getCatalystAPIClient } from '../../../config';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	description: 'Delete a thread',
	tags: ['destructive', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud thread delete thrd_abc123xyz'),
			description: 'Delete a thread by ID',
		},
	],
	aliases: ['rm'],
	requires: { auth: true, region: true },
	schema: {
		args: z.object({
			thread_id: z.string().describe('Thread ID'),
		}),
	},
	async handler(ctx) {
		const { logger, auth, args, region } = ctx;
		const catalystClient = getCatalystAPIClient(logger, auth, region);

		try {
			await threadDelete(catalystClient, { id: args.thread_id });
			tui.success(`Thread ${args.thread_id} deleted successfully`);
		} catch (ex) {
			if (ex instanceof APIError && ex.status === 404) {
				tui.fatal(`Thread ${args.thread_id} not found`, ErrorCode.RESOURCE_NOT_FOUND);
				return;
			}
			tui.fatal(`Failed to delete thread: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
