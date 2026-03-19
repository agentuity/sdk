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
	aliases: ['new'],
	description: 'Create destination for a schedule',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud schedule destination create url sched_abc123 https://example.com'
			),
			description: 'Create URL destination',
		},
		{
			command: getCommand(
				'cloud schedule destination create url sched_abc123 https://example.com --method POST'
			),
			description: 'Create URL destination with POST method',
		},
	],
	schema: {
		args: z.object({
			type: z.enum(['url', 'sandbox']).describe('Destination type (url or sandbox)'),
			schedule_id: z.string().min(1).describe('Schedule ID'),
			target: z.string().min(1).describe('Destination URL or sandbox ID'),
		}),
		options: z.object({
			method: z.string().optional().describe('HTTP method for URL destination'),
			timeout: z.coerce.number().optional().describe('Request timeout in milliseconds'),
			config: z.string().optional().describe('Additional config as JSON object'),
		}),
		response: CreateDestinationResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const schedule = await createScheduleAdapter(ctx);

		if (args.type === 'sandbox' && !args.target.startsWith('sbx_')) {
			tui.fatal('Sandbox target must start with "sbx_"');
		}
		if (
			args.type === 'url' &&
			!args.target.startsWith('http://') &&
			!args.target.startsWith('https://')
		) {
			tui.fatal('URL target must start with http:// or https://');
		}

		let parsedConfig: Record<string, unknown> = {};
		if (opts.config) {
			try {
				parsedConfig = JSON.parse(opts.config) as Record<string, unknown>;
			} catch (e) {
				tui.fatal(`Invalid JSON in --config: ${e instanceof Error ? e.message : String(e)}`);
			}
		}

		const config: Record<string, unknown> = {
			...parsedConfig,
		};

		if (args.type === 'url') {
			config.url = args.target;
		}
		if (args.type === 'sandbox') {
			config.sandbox_id = args.target;
		}
		if (opts.method && args.type === 'url') {
			config.method = opts.method;
		}
		if (opts.timeout !== undefined && args.type === 'url') {
			config.timeout = opts.timeout;
		}

		const result = await schedule.createDestination(args.schedule_id, {
			type: args.type,
			config,
		});

		if (!options.json) {
			tui.success(`Created destination: ${result.destination.id}`);
			tui.table(
				[
					{
						ID: result.destination.id,
						Type: result.destination.type,
					},
				],
				undefined,
				{ layout: 'vertical' }
			);

			if (result.destination.config && Object.keys(result.destination.config).length > 0) {
				tui.newline();
				tui.header('Config');
				tui.json(result.destination.config);
			}
		}

		return result;
	},
});

export default createSubcommand;
