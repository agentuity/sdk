import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { nackMessage } from '@agentuity/server';

const NackResponseSchema = z.object({
	success: z.boolean(),
	queue_name: z.string(),
	message_id: z.string(),
});

export const nackSubcommand = createCommand({
	name: 'nack',
	description: 'Negative acknowledge a message (return to queue for retry)',
	tags: ['mutating', 'updates-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue nack my-queue msg-123'),
			description: 'Return message to queue for retry',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			message_id: z.string().min(1).describe('Message ID'),
		}),
		response: NackResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		await nackMessage(client, args.queue_name, args.message_id, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Returned message to queue: ${args.message_id}`);
		}

		return {
			success: true,
			queue_name: args.queue_name,
			message_id: args.message_id,
		};
	},
});

export default nackSubcommand;
