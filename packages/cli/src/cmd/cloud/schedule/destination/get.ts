import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createScheduleAdapter } from '../util';
import { getCommand } from '../../../../command-prefix';

const DestinationGetResponseSchema = z.object({
	destination: z.object({
		id: z.string(),
		schedule_id: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
		created_by: z.string(),
		type: z.enum(['url', 'sandbox']),
		config: z.record(z.string(), z.unknown()),
	}),
});

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get destination details',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud schedule destination get sched_abc123 sdest_abc456'),
			description: 'Get destination details',
		},
	],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		response: DestinationGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const schedule = createScheduleAdapter(ctx);
		const destination = await schedule.getDestination(args.schedule_id, args.destination_id);

		if (!options.json) {
			tui.table(
				[
					{
						ID: destination.id,
						'Schedule ID': destination.schedule_id,
						Type: destination.type,
						Config: JSON.stringify(destination.config),
						Created: new Date(destination.created_at).toLocaleString(),
						Updated: new Date(destination.updated_at).toLocaleString(),
					},
				],
				undefined,
				{ layout: 'vertical' }
			);
		}

		return { destination };
	},
});

export default getSubcommand;
