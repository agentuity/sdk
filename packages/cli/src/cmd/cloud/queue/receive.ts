import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { receiveMessage, MessageSchema } from '@agentuity/server';

const ReceiveResponseSchema = z.object({
	message: MessageSchema.nullable(),
});

export const receiveSubcommand = createCommand({
	name: 'receive',
	aliases: ['recv', 'claim'],
	description: 'Receive (claim) a message from a worker queue',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue receive my-queue'),
			description: 'Receive next message',
		},
		{
			command: getCommand('cloud queue receive my-queue --timeout 60'),
			description: 'Receive with 60s visibility timeout',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		options: z.object({
			timeout: z.coerce
				.number()
				.default(30)
				.optional()
				.describe('Visibility timeout in seconds (default: 30)'),
		}),
		response: ReceiveResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options, opts } = ctx;
		const client = await createQueueAPIClient(ctx);
		const message = await receiveMessage(
			client,
			args.queue_name,
			opts.timeout,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			if (!message) {
				tui.info('No messages available');
			} else {
				tui.success(`Received message: ${message.id}`);
				tui.info(`  Offset: ${message.offset}`);
				tui.info(`  State: ${message.state}`);
				tui.info(`  Delivery Attempts: ${message.delivery_attempts}`);
				tui.info('');
				tui.info('Payload:');
				tui.json(message.payload);
				if (message.metadata) {
					tui.info('');
					tui.info('Metadata:');
					tui.json(message.metadata);
				}
			}
		}

		return { message };
	},
});

export default receiveSubcommand;
