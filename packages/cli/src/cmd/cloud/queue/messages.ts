import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { listMessages, getMessage, MessageSchema, type Message } from '@agentuity/server';

const MessagesListResponseSchema = z.object({
	messages: z.array(
		z.object({
			id: z.string(),
			offset: z.number(),
			state: z.string().optional(),
			size: z.number().optional(),
			created_at: z.string().optional(),
		})
	),
	total: z.number().optional(),
});

const MessagesResponseSchema = z.union([
	z.object({ type: z.literal('list'), data: MessagesListResponseSchema }),
	z.object({ type: z.literal('message'), message: MessageSchema }),
]);

function displayMessage(message: Message): void {
	const details: Record<string, unknown> = {
		ID: message.id,
		'Queue ID': message.queue_id,
		Offset: message.offset,
		State: message.state,
		'Delivery Attempts': message.delivery_attempts,
	};

	if (message.partition_key) {
		details['Partition Key'] = message.partition_key;
	}
	if (message.idempotency_key) {
		details['Idempotency Key'] = message.idempotency_key;
	}

	details.Published = message.published_at ? new Date(message.published_at).toLocaleString() : '-';
	details.Created = message.created_at ? new Date(message.created_at).toLocaleString() : '-';

	if (message.expires_at) {
		details.Expires = new Date(message.expires_at).toLocaleString();
	}
	if (message.delivered_at) {
		details.Delivered = new Date(message.delivered_at).toLocaleString();
	}
	if (message.acknowledged_at) {
		details.Acknowledged = new Date(message.acknowledged_at).toLocaleString();
	}

	tui.table([details], undefined, { layout: 'vertical' });

	tui.newline();
	tui.info('Payload');
	tui.json(message.payload);

	if (message.metadata && Object.keys(message.metadata).length > 0) {
		tui.newline();
		tui.info('Metadata');
		tui.json(message.metadata);
	}
}

export const messagesSubcommand = createCommand({
	name: 'messages',
	aliases: ['msgs'],
	description: 'List messages in a queue or get a specific message',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue messages my-queue'),
			description: 'List messages in a queue',
		},
		{
			command: getCommand('cloud queue messages my-queue --limit 10'),
			description: 'List first 10 messages',
		},
		{
			command: getCommand('cloud queue messages my-queue msg_abc123'),
			description: 'Get a specific message by ID',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			message_id: z
				.string()
				.optional()
				.describe('Message ID (optional, to get a specific message)'),
		}),
		options: z.object({
			limit: z.number().optional().describe('Maximum number of messages to return'),
			offset: z.number().optional().describe('Offset for pagination'),
		}),
		response: MessagesResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const apiOptions = getQueueApiOptions(ctx);

		if (args.message_id) {
			const message = await getMessage(client, args.queue_name, args.message_id, apiOptions);

			if (!options.json) {
				displayMessage(message);
			}

			return { type: 'message' as const, message };
		}

		const result = await listMessages(
			client,
			args.queue_name,
			{
				limit: opts.limit,
				offset: opts.offset,
			},
			apiOptions
		);

		if (!options.json) {
			if (result.messages.length === 0) {
				tui.info('No messages found');
			} else {
				const tableData = result.messages.map((m: Message) => ({
					ID: m.id,
					Offset: m.offset,
					State: m.state,
					Size: m.size,
					Created: m.created_at ? new Date(m.created_at).toLocaleString() : 'N/A',
				}));
				tui.table(tableData, ['ID', 'Offset', 'State', 'Size', 'Created']);
			}
		}

		return {
			type: 'list' as const,
			data: {
				messages: result.messages.map((m: Message) => ({
					id: m.id,
					offset: m.offset,
					state: m.state,
					size: m.size,
					created_at: m.created_at,
				})),
				total: result.total,
			},
		};
	},
});

export default messagesSubcommand;
