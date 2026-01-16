import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { ackMessage } from '@agentuity/server';

const AckResponseSchema = z.object({
	success: z.boolean(),
	queue_name: z.string(),
	message_id: z.string(),
});

export const ackSubcommand = createCommand({
	name: 'ack',
	description: 'Acknowledge a message (mark as processed)',
	tags: ['mutating', 'updates-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue ack my-queue msg-123'),
			description: 'Acknowledge a message',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			message_id: z.string().min(1).describe('Message ID'),
		}),
		response: AckResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		await ackMessage(client, args.queue_name, args.message_id, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Acknowledged message: ${args.message_id}`);
		}

		return {
			success: true,
			queue_name: args.queue_name,
			message_id: args.message_id,
		};
	},
});

export default ackSubcommand;
