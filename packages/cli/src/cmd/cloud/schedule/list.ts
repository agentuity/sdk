import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createScheduleAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const ScheduleListResponseSchema = z.object({
	schedules: z.array(
		z.object({
			id: z.string(),
			created_at: z.string(),
			updated_at: z.string(),
			created_by: z.string(),
			name: z.string(),
			description: z.string().nullable(),
			expression: z.string(),
			due_date: z.string(),
		})
	),
	total: z.number(),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List schedules',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud schedule list'), description: 'List schedules' },
		{ command: getCommand('cloud schedule list --limit 20'), description: 'List 20 schedules' },
	],
	schema: {
		options: z.object({
			limit: z.coerce.number().min(0).optional().describe('Maximum number of schedules'),
			offset: z.coerce.number().min(0).optional().describe('Pagination offset'),
		}),
		response: ScheduleListResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const schedule = createScheduleAdapter(ctx);
		const result = await schedule.list({ limit: opts.limit, offset: opts.offset });

		if (!options.json) {
			if (result.schedules.length === 0) {
				tui.info('No schedules found');
			} else {
				tui.table(
					result.schedules.map((item: {
						id: string;
						created_at: string;
						updated_at: string;
						created_by: string;
						name: string;
						description: string | null;
						expression: string;
						due_date: string;
					}) => ({
						Name: item.name,
						ID: item.id,
						Expression: item.expression,
						'Next Due': item.due_date,
						Created: new Date(item.created_at).toLocaleString(),
					})),
					['Name', 'ID', 'Expression', 'Next Due', 'Created']
				);
			}
		}

		return result;
	},
});

export default listSubcommand;
