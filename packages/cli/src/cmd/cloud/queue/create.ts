import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createQueueAPIClient, getQueueApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { createQueue, QueueTypeSchema } from '@agentuity/server';

const QueueCreateResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	queue_type: z.string(),
	created_at: z.string(),
});

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new queue',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue create worker --name my-tasks'),
			description: 'Create a worker queue named my-tasks',
		},
		{
			command: getCommand('cloud queue create pubsub --name events --ttl 86400'),
			description: 'Create a pubsub queue with 24h TTL',
		},
	],
	schema: {
		args: z.object({
			queue_type: QueueTypeSchema.describe('Queue type: worker or pubsub'),
		}),
		options: z.object({
			name: z.string().optional().describe('Queue name (auto-generated if not provided)'),
			description: z.string().optional().describe('Queue description'),
			ttl: z.coerce.number().optional().describe('Default message TTL in seconds'),
			visibilityTimeout: z.coerce
				.number()
				.optional()
				.describe('Default visibility timeout in seconds (worker queues)'),
			maxRetries: z.coerce
				.number()
				.optional()
				.describe('Maximum retry attempts for failed messages'),
		}),
		response: QueueCreateResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		const settings: Record<string, number | undefined> = {};
		if (opts?.ttl !== undefined) {
			settings.default_ttl_seconds = opts.ttl;
		}
		if (opts?.visibilityTimeout !== undefined) {
			settings.default_visibility_timeout_seconds = opts.visibilityTimeout;
		}
		if (opts?.maxRetries !== undefined) {
			settings.default_max_retries = opts.maxRetries;
		}

		const queue = await createQueue(
			client,
			{
				name: opts?.name,
				description: opts?.description,
				queue_type: args.queue_type,
				settings: Object.keys(settings).length > 0 ? settings : undefined,
			},
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Created queue: ${queue.name}`);
			console.log(`  ID:   ${queue.id}`);
			console.log(`  Type: ${queue.queue_type}`);
		}

		return {
			id: queue.id,
			name: queue.name,
			queue_type: queue.queue_type,
			created_at: queue.created_at,
		};
	},
});

export default createSubcommand;
