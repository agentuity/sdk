import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createQueueAPIClient, getQueueApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { resumeQueue, QueueSchema } from '@agentuity/server/index.ts';

export const resumeSubcommand = createCommand({
	name: 'resume',
	description: 'Resume message delivery for a paused queue',
	tags: ['mutating', 'updates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue resume my-queue'),
			description: 'Resume a paused queue',
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

		const queue = await resumeQueue(client, args.name, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Resumed queue: ${queue.name}`);
		}

		return queue;
	},
});

export default resumeSubcommand;
