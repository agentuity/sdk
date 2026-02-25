import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createScheduleAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const ScheduleUpdateResponseSchema = z.object({
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
});

export const updateSubcommand = createCommand({
	name: 'update',
	description: 'Update a schedule',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand("cloud schedule update sched_abc123 --expression '*/5 * * * *'"),
			description: 'Update schedule expression',
		},
	],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
		}),
		options: z.object({
			name: z.string().optional().describe('Schedule name'),
			expression: z.string().optional().describe('Cron expression'),
			description: z.string().optional().describe('Schedule description'),
		}),
		response: ScheduleUpdateResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const schedule = createScheduleAdapter(ctx);
		const result = await schedule.update(args.schedule_id, {
			name: opts.name,
			expression: opts.expression,
			description: opts.description,
		});

		if (!options.json) {
			tui.success(`Updated schedule: ${result.schedule.name}`);
			tui.table(
				[
					{
						Name: result.schedule.name,
						ID: result.schedule.id,
						Expression: result.schedule.expression,
						Description: result.schedule.description ?? '-',
						Updated: new Date(result.schedule.updated_at).toLocaleString(),
					},
				],
				undefined,
				{ layout: 'vertical' }
			);
		}

		return result;
	},
});

export default updateSubcommand;
