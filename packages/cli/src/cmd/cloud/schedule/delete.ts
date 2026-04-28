import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createScheduleAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';

const ScheduleDeleteResponseSchema = z.object({
	success: z.boolean(),
	schedule_id: z.string(),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove', 'terminate'],
	description: 'Delete a schedule',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud schedule delete sched_abc123'),
			description: 'Delete a schedule',
		},
	],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
		}),
		response: ScheduleDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const schedule = await createScheduleAdapter(ctx);
		await schedule.delete(args.schedule_id);

		if (!options.json) {
			tui.success(`Deleted schedule: ${args.schedule_id}`);
		}

		return { success: true, schedule_id: args.schedule_id };
	},
});

export default deleteSubcommand;
