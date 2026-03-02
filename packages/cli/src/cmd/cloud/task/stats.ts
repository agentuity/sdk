import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getGlobalCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { getServiceStats, type ServiceStatsData } from '@agentuity/server';

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function displayStats(data: ServiceStatsData): void {
	const svc = data.services.task;
	if (!svc) {
		tui.info('No task data found.');
		return;
	}
	tui.header('Task Statistics');
	tui.newline();
	console.log(`  ${tui.muted('Total:')}           ${formatNumber(svc.total)}`);
	console.log(`  ${tui.muted('Open:')}            ${formatNumber(svc.open)}`);
	console.log(`  ${tui.muted('In Progress:')}     ${formatNumber(svc.inProgress)}`);
	console.log(`  ${tui.muted('Done:')}            ${formatNumber(svc.done)}`);
	console.log(`  ${tui.muted('Closed:')}          ${formatNumber(svc.closed)}`);
	console.log(`  ${tui.muted('Cancelled:')}       ${formatNumber(svc.cancelled)}`);
}

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'View task statistics',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud task stats'),
			description: 'View task statistics',
		},
	],
	schema: {
		options: z.object({
			start: z.string().optional().describe('Start time (ISO 8601)'),
			end: z.string().optional().describe('End time (ISO 8601)'),
		}),
	},
	idempotent: true,

	async handler(ctx) {
		const { opts, options } = ctx;
		const client = await getGlobalCatalystAPIClient(ctx.logger, ctx.auth, ctx.config?.name);
		const orgId = ctx.orgId ?? ctx.options.orgId ?? ctx.config?.preferences?.orgId;

		if (!orgId) {
			ctx.logger.fatal('Organization ID is required. Use --org-id or set a preferred org.');
			return;
		}

		const data = await getServiceStats(client, orgId, {
			service: 'task',
			start: opts.start,
			end: opts.end,
			orgIdHeader: orgId,
		});

		if (!options.json) {
			displayStats(data);
		}

		return data;
	},
});

export default statsSubcommand;
