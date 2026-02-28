import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createScheduleAdapter } from '../util';
import { getCommand } from '../../../../command-prefix';

const DeliveryListResponseSchema = z.object({
	deliveries: z.array(
		z.object({
			id: z.string(),
			date: z.string(),
			schedule_id: z.string(),
			schedule_destination_id: z.string(),
			status: z.enum(['pending', 'success', 'failed']),
			retries: z.number(),
			error: z.string().nullable(),
			response: z.record(z.string(), z.unknown()).nullable(),
		})
	),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List deliveries for a schedule',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud schedule delivery list sched_abc123 --limit 50'),
			description: 'List schedule deliveries',
		},
	],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
		}),
		options: z.object({
			limit: z.coerce.number().min(0).optional().describe('Maximum number of deliveries'),
			offset: z.coerce.number().min(0).optional().describe('Pagination offset'),
		}),
		response: DeliveryListResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const schedule = await createScheduleAdapter(ctx);
		const result = await schedule.listDeliveries(args.schedule_id, {
			limit: opts.limit,
			offset: opts.offset,
		});

		if (!options.json) {
			if (result.deliveries.length === 0) {
				tui.info('No deliveries found');
			} else {
				tui.table(
					result.deliveries.map(
						(delivery: {
							id: string;
							date: string;
							status: 'pending' | 'success' | 'failed';
							retries: number;
							schedule_destination_id: string;
						}) => ({
							ID: delivery.id,
							Date: new Date(delivery.date).toLocaleString(),
							Status: delivery.status,
							Retries: delivery.retries,
							'Destination ID': delivery.schedule_destination_id,
						})
					),
					['ID', 'Date', 'Status', 'Retries', 'Destination ID']
				);
			}
		}

		return result;
	},
});

export default listSubcommand;
