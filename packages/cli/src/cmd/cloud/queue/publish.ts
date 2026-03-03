import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { publishMessage, MessageSchema } from '@agentuity/server';
import { ErrorCode } from '../../../errors';

export const publishSubcommand = createCommand({
	name: 'publish',
	aliases: ['pub', 'send'],
	description: 'Publish a message to a queue',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue publish my-queue \'{"task":"process"}\''),
			description: 'Publish a JSON message',
		},
		{
			command: getCommand(
				'cloud queue publish my-queue \'{"task":"process"}\' --metadata \'{"priority":"high"}\''
			),
			description: 'Publish with metadata',
		},
		{
			command: getCommand('cloud queue publish my-queue "hello" --ttl 3600'),
			description: 'Publish with 1h TTL',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			payload: z.string().min(1).describe('Message payload (JSON)'),
		}),
		options: z.object({
			metadata: z.string().optional().describe('Message metadata as JSON'),
			partitionKey: z.string().optional().describe('Partition key for ordering'),
			idempotencyKey: z.string().optional().describe('Idempotency key to prevent duplicates'),
			ttl: z.coerce.number().optional().describe('Message TTL in seconds'),
			sync: z.boolean().optional().describe('Publish synchronously (wait for persistence)'),
		}),
		response: MessageSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		let payload: unknown;
		try {
			payload = JSON.parse(args.payload);
		} catch {
			tui.fatal('Invalid payload JSON', ErrorCode.INVALID_ARGUMENT);
		}

		let metadata: Record<string, unknown> | undefined;
		if (opts.metadata) {
			try {
				metadata = JSON.parse(opts.metadata);
			} catch {
				tui.fatal('Invalid metadata JSON', ErrorCode.INVALID_ARGUMENT);
			}
		}

		const apiOptions = getQueueApiOptions(ctx) ?? {};
		if (opts.sync) {
			apiOptions.sync = true;
		}

		const message = await publishMessage(
			client,
			args.queue_name,
			{
				payload,
				metadata,
				partition_key: opts.partitionKey,
				idempotency_key: opts.idempotencyKey,
				ttl_seconds: opts.ttl,
			},
			apiOptions
		);

		if (!options.json) {
			tui.success(`Published message: ${message.id}`);
			console.log(`  Offset: ${message.offset}`);
			console.log(`  State:  ${message.state}`);
		}

		return message;
	},
});

export default publishSubcommand;
