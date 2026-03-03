import { z } from 'zod';
import { createCommand } from '../../../../types.ts';
import * as tui from '../../../../tui.ts';
import { createScheduleAdapter } from '../util.ts';
import { getCommand } from '../../../../command-prefix.ts';

const DestinationDeleteResponseSchema = z.object({
	success: z.boolean(),
	destination_id: z.string(),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm'],
	description: 'Delete a destination',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud schedule destination delete sdest_abc456'),
			description: 'Delete destination',
		},
	],
	schema: {
		args: z.object({
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		response: DestinationDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const schedule = await createScheduleAdapter(ctx);
		await schedule.deleteDestination(args.destination_id);

		if (!options.json) {
			tui.success(`Deleted destination: ${args.destination_id}`);
		}

		return { success: true, destination_id: args.destination_id };
	},
});

export default deleteSubcommand;
