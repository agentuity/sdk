import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createScheduleAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const ScheduleGetResponseSchema = z.object({
	schedule: z.object({
		id: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
		created_by: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		expression: z.string(),
		due_date: z.string(),
	}),
	destinations: z.array(
		z.object({
			id: z.string(),
			schedule_id: z.string(),
			created_at: z.string(),
			updated_at: z.string(),
			created_by: z.string(),
			type: z.enum(['url', 'sandbox']),
			config: z.record(z.string(), z.unknown()),
		})
	),
});

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get schedule details',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	idempotent: true,
		examples: [
			{ command: getCommand('cloud schedule get sched_abc123'), description: 'Get schedule details' },
		],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
		}),
		response: ScheduleGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const schedule = createScheduleAdapter(ctx);
		const result = await schedule.get(args.schedule_id);

		if (!options.json) {
			const details: Record<string, unknown> = {
				Name: result.schedule.name,
				ID: result.schedule.id,
				Expression: result.schedule.expression,
				Description: result.schedule.description ?? '-',
				'Next Due': result.schedule.due_date,
				Created: new Date(result.schedule.created_at).toLocaleString(),
				Updated: new Date(result.schedule.updated_at).toLocaleString(),
			};

			tui.table([details], undefined, { layout: 'vertical', padStart: '  ' });

			tui.newline();
			tui.info('Destinations');
			if (result.destinations.length === 0) {
				tui.info('No destinations configured');
			} else {
				tui.table(
					result.destinations.map((destination: {
						id: string;
						type: 'url' | 'sandbox';
						config: Record<string, unknown>;
						created_at: string;
					}) => ({
						ID: destination.id,
						Type: destination.type,
						Config: JSON.stringify(destination.config),
						Created: new Date(destination.created_at).toLocaleString(),
					})),
					['ID', 'Type', 'Config', 'Created']
				);
			}
		}

		return result;
	},
});

export default getSubcommand;
