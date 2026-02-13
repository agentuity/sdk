import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { listQueues, type Queue } from '@agentuity/server';

const QueueListResponseSchema = z.object({
	queues: z.array(
		z.object({
			name: z.string(),
			queue_type: z.string(),
			message_count: z.number(),
			dlq_count: z.number(),
			created_at: z.string(),
		})
	),
	total: z.number().optional(),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all queues',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{ command: getCommand('cloud queue list'), description: 'List all queues' },
		{ command: getCommand('cloud queue ls'), description: 'List all queues (alias)' },
	],
	schema: {
		args: z.object({}),
		options: z.object({
			orgId: z.string().optional().describe('filter by organization id'),
			limit: z.coerce.number().optional().describe('Maximum number of queues to return'),
			offset: z.coerce.number().optional().describe('Offset for pagination'),
			name: z.string().optional().describe('Filter by queue name'),
			queueType: z.enum(['worker', 'pubsub']).optional().describe('Filter by queue type'),
			status: z
				.enum(['active', 'paused'])
				.optional()
				.describe('Filter by queue status (active or paused)'),
			sort: z
				.enum(['name', 'created', 'updated', 'message_count', 'dlq_count'])
				.optional()
				.describe('field to sort by (default: created)'),
			direction: z.enum(['asc', 'desc']).optional().describe('sort direction (default: desc)'),
		}),
		response: QueueListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { options, opts } = ctx;
		const client = await createQueueAPIClient(ctx);
		const queueOptions = opts?.orgId ? { orgId: opts.orgId } : getQueueApiOptions(ctx);
		const result = await listQueues(
			client,
			{
				limit: opts.limit,
				offset: opts.offset,
				sort: opts.sort,
				direction: opts.direction,
				name: opts.name,
				queue_type: opts.queueType,
				status: opts.status,
			},
			queueOptions
		);

		if (!options.json) {
			if (result.queues.length === 0) {
				tui.info('No queues found');
			} else {
				const tableData = result.queues.map((q: Queue) => ({
					Name: q.name,
					Type: q.queue_type,
					Messages: q.message_count ?? 0,
					DLQ: q.dlq_count ?? 0,
					Created: new Date(q.created_at).toLocaleString(),
				}));
				tui.table(tableData, ['Name', 'Type', 'Messages', 'DLQ', 'Created']);
			}
		}

		return {
			queues: result.queues.map((q: Queue) => ({
				name: q.name,
				queue_type: q.queue_type,
				message_count: q.message_count ?? 0,
				dlq_count: q.dlq_count ?? 0,
				created_at: q.created_at,
			})),
			total: result.total,
		};
	},
});

export default listSubcommand;
