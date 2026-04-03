import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

function formatRelativeTime(isoDate: string): string {
	const diffMs = Date.now() - new Date(isoDate).getTime();
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const eventsSubcommand = createSubcommand({
	name: 'events',
	aliases: ['event', 'ev'],
	description: 'List event history for a Coder Hub session',
	tags: ['read-only', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder events codesess_abc123'),
			description: 'List recent session events',
		},
		{
			command: getCommand('coder events codesess_abc123 --limit 100 --json'),
			description: 'Get session event history as JSON',
		},
	],
	schema: {
		args: z.object({
			sessionId: z.string().describe('Session ID to list events for'),
		}),
		options: z.object({
			limit: z
				.number()
				.int()
				.positive()
				.optional()
				.describe('Maximum number of events to return'),
			url: z.string().optional().describe('Coder API URL override'),
		}),
	},
	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		try {
			const data = await client.listEventHistory(args.sessionId, {
				limit: opts?.limit ?? 50,
			});

			if (options.json) {
				return data;
			}

			if (data.events.length === 0) {
				tui.info(`No events found for session ${args.sessionId}.`);
				return data;
			}

			tui.table(
				data.events.map((e) => ({
					Event: e.event,
					Category: e.category ?? '-',
					Agent: e.agent ?? '-',
					'Task ID': e.taskId ?? '-',
					Occurred: e.occurredAt ? formatRelativeTime(e.occurredAt) : '-',
				})),
				[
					{ name: 'Event', alignment: 'left' },
					{ name: 'Category', alignment: 'left' },
					{ name: 'Agent', alignment: 'left' },
					{ name: 'Task ID', alignment: 'left' },
					{ name: 'Occurred', alignment: 'right' },
				]
			);

			return data;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(
				`Failed to list event history for session ${args.sessionId}: ${msg}`,
				ErrorCode.NETWORK_ERROR
			);
		}
	},
});
