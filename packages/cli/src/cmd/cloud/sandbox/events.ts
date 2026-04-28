import { sandboxEventList } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import * as tui from '../../../tui.ts';
import { createCommand } from '../../../types.ts';
import { createSandboxClient, getSandboxRegion } from './util.ts';

const SandboxEventInfoSchema = z.object({
	eventId: z.string().describe('Event ID'),
	sandboxId: z.string().describe('Sandbox ID'),
	type: z.string().describe('Event type'),
	event: z.record(z.string(), z.unknown()).describe('Event data'),
	createdAt: z.string().describe('Creation timestamp'),
});

const SandboxEventListResponseSchema = z.object({
	events: z.array(SandboxEventInfoSchema).describe('List of events'),
});

export const eventsSubcommand = createCommand({
	name: 'events',
	aliases: ['event'],
	description: 'List events for a sandbox',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox events sbx_abc123'),
			description: 'List events for a sandbox (oldest first)',
		},
		{
			command: getCommand('cloud sandbox events sbx_abc123 --reverse'),
			description: 'List events newest first',
		},
		{
			command: getCommand('cloud sandbox events sbx_abc123 --limit 10'),
			description: 'List events with a limit',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		options: z.object({
			limit: z.number().optional().describe('Maximum number of results (default: 50, max: 100)'),
			reverse: z.boolean().optional().describe('Reverse sort order (newest first)'),
			orgId: z.string().optional().describe('filter by organization id'),
		}),
		response: SandboxEventListResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, orgId: ctxOrgId, config } = ctx;
		const effectiveOrgId = opts?.orgId || ctxOrgId;
		const region = await getSandboxRegion(
			logger,
			auth,
			config?.name,
			args.sandboxId,
			effectiveOrgId,
			config
		);
		const client = createSandboxClient(logger, auth, region);

		const result = await sandboxEventList(client, {
			sandboxId: args.sandboxId,
			orgId: effectiveOrgId,
			limit: opts.limit,
			direction: opts.reverse ? 'desc' : undefined,
		});

		if (!options.json) {
			if (result.events.length === 0) {
				tui.info('No events found');
			} else {
				const tableData = result.events.map((evt) => {
					return {
						ID: evt.eventId,
						Type: evt.type,
						Created: evt.createdAt,
					};
				});
				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Type', alignment: 'left' },
					{ name: 'Created', alignment: 'left' },
				]);

				tui.info(
					`Total: ${result.events.length} ${tui.plural(result.events.length, 'event', 'events')}`
				);
			}
		}

		return {
			events: result.events.map((e) => ({
				eventId: e.eventId,
				sandboxId: e.sandboxId,
				type: e.type,
				event: e.event,
				createdAt: e.createdAt,
			})),
		};
	},
});

export default eventsSubcommand;
