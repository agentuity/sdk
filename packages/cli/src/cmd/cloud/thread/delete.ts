import { APIError, threadDelete } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { getGlobalCatalystAPIClient } from '../../../config';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';

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
	aliases: ['rm', 'del', 'remove', 'terminate'],
	requires: { auth: true },
	schema: {
		args: z.object({
			thread_id: z.string().describe('Thread ID'),
		}),
	},
	async handler(ctx) {
		const { logger, auth, args, config } = ctx;
		const catalystClient = await getGlobalCatalystAPIClient(
			logger,
			auth,
			config?.name,
			undefined,
			config
		);

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
