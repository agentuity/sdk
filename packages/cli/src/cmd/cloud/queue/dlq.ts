import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import {
	listDeadLetterMessages,
	replayDeadLetterMessage,
	purgeDeadLetter,
	type DeadLetterMessage,
	MessageSchema,
} from '@agentuity/server';
import { ErrorCode } from '../../../errors';

const DlqListResponseSchema = z.object({
	messages: z.array(
		z.object({
			id: z.string(),
			offset: z.number(),
			failure_reason: z.string().nullable(),
			delivery_attempts: z.number(),
			moved_at: z.string(),
		})
	),
	total: z.number().optional(),
});

const listDlqSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List messages in the dead letter queue',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue dlq list my-queue'),
			description: 'List DLQ messages',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			limit: z.coerce.number().optional().describe('Maximum number of messages to return'),
			offset: z.coerce.number().optional().describe('Offset for pagination'),
		}),
		response: DlqListResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const result = await listDeadLetterMessages(
			client,
			args.queue_name,
			{
				limit: args.limit,
				offset: args.offset,
			},
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			if (result.messages.length === 0) {
				tui.info('No messages in dead letter queue');
			} else {
				const tableData = result.messages.map((m: DeadLetterMessage) => ({
					ID: m.id.substring(0, 8) + '...',
					Offset: m.offset,
					Reason: m.failure_reason?.substring(0, 30) || 'Unknown',
					Attempts: m.delivery_attempts,
					'Moved At': new Date(m.moved_at).toLocaleString(),
				}));
				tui.table(tableData, ['ID', 'Offset', 'Reason', 'Attempts', 'Moved At']);
			}
		}

		return {
			messages: result.messages.map((m: DeadLetterMessage) => ({
				id: m.id,
				offset: m.offset,
				failure_reason: m.failure_reason ?? null,
				delivery_attempts: m.delivery_attempts,
				moved_at: m.moved_at,
			})),
			total: result.total,
		};
	},
});

const ReplayResponseSchema = z.object({
	success: z.boolean(),
	message: MessageSchema,
});

const replayDlqSubcommand = createSubcommand({
	name: 'replay',
	description: 'Replay a message from the dead letter queue',
	tags: ['mutating', 'updates-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue dlq replay my-queue msg-123'),
			description: 'Replay a DLQ message',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			message_id: z.string().min(1).describe('Message ID'),
		}),
		response: ReplayResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const message = await replayDeadLetterMessage(
			client,
			args.queue_name,
			args.message_id,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Replayed message: ${message.id}`);
			tui.info(`  New offset: ${message.offset}`);
		}

		return {
			success: true,
			message,
		};
	},
});

const PurgeResponseSchema = z.object({
	success: z.boolean(),
	queue_name: z.string(),
});

const purgeDlqSubcommand = createSubcommand({
	name: 'purge',
	description: 'Purge all messages from the dead letter queue',
	tags: ['mutating', 'deletes-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue dlq purge my-queue --yes'),
			description: 'Purge all DLQ messages',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		options: z.object({
			yes: z.boolean().default(false).describe('Skip confirmation prompt'),
		}),
		response: PurgeResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;

		if (!opts.yes) {
			tui.fatal('Use --yes to confirm DLQ purge', ErrorCode.INVALID_ARGUMENT);
		}

		const client = await createQueueAPIClient(ctx);
		await purgeDeadLetter(client, args.queue_name, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Purged dead letter queue for: ${args.queue_name}`);
		}

		return {
			success: true,
			queue_name: args.queue_name,
		};
	},
});

export const dlqSubcommand = createCommand({
	name: 'dlq',
	description: 'Dead letter queue operations',
	tags: ['requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue dlq list my-queue'),
			description: 'List DLQ messages',
		},
		{
			command: getCommand('cloud queue dlq replay my-queue msg-123'),
			description: 'Replay a message',
		},
	],
	subcommands: [listDlqSubcommand, replayDlqSubcommand, purgeDlqSubcommand],
});

export default dlqSubcommand;
