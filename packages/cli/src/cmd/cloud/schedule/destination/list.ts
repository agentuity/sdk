import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createScheduleAdapter } from '../util';
import { getCommand } from '../../../../command-prefix';

const DestinationListResponseSchema = z.object({
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

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List destinations for a schedule',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud schedule destination list sched_abc123'),
			description: 'List schedule destinations',
		},
	],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
		}),
		response: DestinationListResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const schedule = await createScheduleAdapter(ctx);
		const result = await schedule.get(args.schedule_id);

		if (!options.json) {
			if (result.destinations.length === 0) {
				tui.info('No destinations configured');
			} else {
				tui.table(
					result.destinations.map(
						(destination: {
							id: string;
							type: 'url' | 'sandbox';
							config: Record<string, unknown>;
							created_at: string;
						}) => {
							const configDisplay =
								destination.type === 'url' && destination.config?.url
									? String(destination.config.url)
									: JSON.stringify(destination.config);
							return {
								ID: destination.id,
								Type: destination.type,
								URL: configDisplay,
								Created: new Date(destination.created_at).toLocaleString(),
							};
						}
					),
					['ID', 'Type', 'URL', 'Created']
				);
			}
		}

		return { destinations: result.destinations };
	},
});

export default listSubcommand;
