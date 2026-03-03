import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { threadDelete, APIError } from '@agentuity/server/index.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { getGlobalCatalystAPIClient } from '../../../config.ts';

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
	requires: { auth: true },
	schema: {
		args: z.object({
			thread_id: z.string().describe('Thread ID'),
		}),
	},
	async handler(ctx) {
		const { logger, auth, args, config } = ctx;
		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);

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
