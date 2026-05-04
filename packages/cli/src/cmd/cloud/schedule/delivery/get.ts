import { z } from 'zod';
import { createCommand } from '../../../../types.ts';
import * as tui from '../../../../tui.ts';
import { createScheduleAdapter } from '../util.ts';
import { getCommand } from '../../../../command-prefix.ts';

const DeliveryGetResponseSchema = z.object({
	delivery: z.object({
		id: z.string(),
		date: z.string(),
		schedule_id: z.string(),
		schedule_destination_id: z.string(),
		status: z.enum(['pending', 'success', 'failed']),
		retries: z.number(),
		error: z.string().nullable(),
		response: z.record(z.string(), z.unknown()).nullable(),
	}),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get delivery details',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud schedule delivery get sched_abc123 sdel_abc456'),
			description: 'Get delivery details',
		},
	],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
			delivery_id: z.string().min(1).describe('Delivery ID'),
		}),
		options: z.object({
			limit: z.coerce
				.number()
				.min(0)
				.optional()
				.describe('Maximum number of deliveries to scan while filtering'),
			offset: z.coerce
				.number()
				.min(0)
				.optional()
				.describe('Offset while scanning deliveries for filtering'),
		}),
		response: DeliveryGetResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const schedule = await createScheduleAdapter(ctx);
		const delivery = await schedule.getDelivery(args.schedule_id, args.delivery_id, {
			limit: opts.limit,
			offset: opts.offset,
		});

		if (!options.json) {
			const details: Record<string, unknown> = {
				ID: delivery.id,
				'Schedule ID': delivery.schedule_id,
				'Destination ID': delivery.schedule_destination_id,
				Date: new Date(delivery.date).toLocaleString(),
				Status: delivery.status,
				Retries: delivery.retries,
				Error: delivery.error ?? '-',
			};

			tui.table([details], undefined, { layout: 'vertical' });

			if (delivery.response) {
				tui.newline();
				tui.header('Response');
				tui.json(delivery.response);
			}
		}

		return { delivery };
	},
});

export default getSubcommand;
