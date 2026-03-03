import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createScheduleAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';

const CreateScheduleResponseSchema = z.object({
	schedule: z.object({
		id: z.string(),
		name: z.string(),
		expression: z.string(),
		description: z.string().nullable(),
		due_date: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
		created_by: z.string(),
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

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create a schedule',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand("cloud schedule create --name nightly --expression '0 0 * * *'"),
			description: 'Create a nightly schedule',
		},
	],
	schema: {
		options: z.object({
			name: z.string().min(1).describe('Schedule name'),
			expression: z.string().min(1).describe('Cron expression'),
			description: z.string().optional().describe('Schedule description'),
		}),
		response: CreateScheduleResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const schedule = await createScheduleAdapter(ctx);
		const result = await schedule.create({
			name: opts.name,
			expression: opts.expression,
			description: opts.description,
		});

		if (!options.json) {
			tui.success(`Created schedule: ${result.schedule.name}`);
			tui.table(
				[
					{
						Name: result.schedule.name,
						ID: result.schedule.id,
						Expression: result.schedule.expression,
						Description: result.schedule.description || '-',
						'Next Due': result.schedule.due_date,
						Created: new Date(result.schedule.created_at).toLocaleString(),
					},
				],
				undefined,
				{ layout: 'vertical' }
			);
		}

		return result;
	},
});

export default createSubcommand;
