import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createScheduleAdapter } from '../util';
import { getCommand } from '../../../../command-prefix';

const CreateDestinationResponseSchema = z.object({
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

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create destination for a schedule',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand('cloud schedule destination create sched_abc123 --type url --url https://example.com'),
			description: 'Create URL destination',
		},
	],
	schema: {
		args: z.object({
			schedule_id: z.string().min(1).describe('Schedule ID'),
		}),
		options: z.object({
			type: z.enum(['url', 'sandbox']).describe('Destination type'),
			url: z.string().url().optional().describe('Destination URL (required for type=url)'),
			sandboxId: z.string().optional().describe('Sandbox ID (for type=sandbox)'),
			method: z.string().optional().describe('HTTP method for URL destination'),
			timeout: z.coerce.number().optional().describe('Request timeout in milliseconds'),
			config: z.string().optional().describe('Additional config as JSON object'),
		}),
		response: CreateDestinationResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const schedule = createScheduleAdapter(ctx);

		if (opts.type === 'url' && !opts.url) {
			tui.fatal('--url is required when --type=url');
		}

		const parsedConfig = opts.config
			? (JSON.parse(opts.config) as Record<string, unknown>)
			: {};

		const config: Record<string, unknown> = {
			...parsedConfig,
		};

		if (opts.type === 'url' && opts.url) {
			config.url = opts.url;
		}
		if (opts.type === 'sandbox' && opts.sandboxId) {
			config.sandbox_id = opts.sandboxId;
		}
		if (opts.method) {
			config.method = opts.method;
		}
		if (opts.timeout !== undefined) {
			config.timeout = opts.timeout;
		}

		const result = await schedule.createDestination(args.schedule_id, {
			type: opts.type,
			config,
		});

		if (!options.json) {
			tui.success(`Created destination: ${result.destination.id}`);
			tui.table(
				[
					{
						ID: result.destination.id,
						Type: result.destination.type,
						Config: JSON.stringify(result.destination.config),
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
