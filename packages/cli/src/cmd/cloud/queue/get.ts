import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { getQueue, getMessage, QueueSchema, MessageSchema, type Message } from '@agentuity/server';

const GetResponseSchema = z.union([
	z.object({ type: z.literal('queue'), queue: QueueSchema }),
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
	tui.header('Payload');
	tui.json(message.payload);

	if (message.metadata && Object.keys(message.metadata).length > 0) {
		tui.newline();
		tui.header('Metadata');
		tui.json(message.metadata);
	}
}

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get queue or message details',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{ command: getCommand('cloud queue get my-queue'), description: 'Get queue details' },
		{
			command: getCommand('cloud queue get my-queue msg_abc123'),
			description: 'Get message details',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			message_id: z.string().optional().describe('Message ID (msg_...) to get message details'),
		}),
		response: GetResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const apiOptions = getQueueApiOptions(ctx);

		if (args.message_id) {
			const message = await getMessage(client, args.queue_name, args.message_id, apiOptions);

			if (!options.json) {
				displayMessage(message);
			}

			return { type: 'message' as const, message };
		}

		const queue = await getQueue(client, args.queue_name, apiOptions);

		if (!options.json) {
			const details: Record<string, unknown> = {
				Name: queue.name,
				ID: queue.id,
				Type: queue.queue_type,
			};

			if (queue.description) {
				details.Description = queue.description;
			}

			if (queue.paused_at) {
				details.Status = 'Paused';
				details['Paused At'] = new Date(queue.paused_at).toLocaleString();
			} else {
				details.Status = 'Active';
			}

			details.Created = new Date(queue.created_at).toLocaleString();
			details.Updated = new Date(queue.updated_at).toLocaleString();

			tui.table([details], undefined, { layout: 'vertical' });

			if (
				queue.message_count !== undefined ||
				queue.dlq_count !== undefined ||
				queue.next_offset !== undefined
			) {
				tui.newline();
				tui.header('Stats');
				tui.table(
					[
						{
							Messages: queue.message_count ?? 0,
							'DLQ Count': queue.dlq_count ?? 0,
							'Next Offset': queue.next_offset ?? 0,
						},
					],
					undefined,
					{ layout: 'vertical' }
				);
			}

			if (queue.default_visibility_timeout_seconds !== undefined) {
				tui.newline();
				tui.header('Settings');
				const settings: Record<string, unknown> = {};
				if (queue.default_ttl_seconds != null) {
					settings['Default TTL'] = `${queue.default_ttl_seconds}s`;
				}
				settings['Visibility Timeout'] = `${queue.default_visibility_timeout_seconds}s`;
				settings['Max Retries'] = queue.default_max_retries;
				settings['Retry Backoff'] = `${queue.default_retry_backoff_ms}ms`;
				settings['Max Backoff'] = `${queue.default_retry_max_backoff_ms}ms`;
				settings['Backoff Multiplier'] = `${queue.default_retry_multiplier}x`;
				settings['Max In-Flight'] = queue.max_in_flight_per_client;

				tui.table([settings], undefined, { layout: 'vertical' });
			}
		}

		return { type: 'queue' as const, queue };
	},
});

export default getSubcommand;
