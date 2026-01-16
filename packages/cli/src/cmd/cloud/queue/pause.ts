import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { pauseQueue, QueueSchema } from '@agentuity/server';

export const pauseSubcommand = createCommand({
	name: 'pause',
	description: 'Pause message delivery for a queue',
	tags: ['mutating', 'updates-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue pause my-queue'),
			description: 'Pause a queue',
		},
	],
	schema: {
		args: z.object({
			name: z.string().min(1).describe('Queue name'),
		}),
		response: QueueSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		const queue = await pauseQueue(client, args.name, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Paused queue: ${queue.name}`);
			tui.info(`  Paused at: ${queue.paused_at}`);
		}

		return queue;
	},
});

export default pauseSubcommand;
