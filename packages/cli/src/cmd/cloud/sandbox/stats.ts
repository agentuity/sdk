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

function formatLatency(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

function displayStats(data: ServiceStatsData): void {
	const svc = data.services.sandbox;
	if (!svc) {
		tui.info('No sandbox data found.');
		return;
	}
	tui.header('Sandbox Statistics');
	tui.newline();
	console.log(
		`  ${tui.muted('Active:')}          ${formatNumber(svc.totalActive)} (${svc.running} running, ${svc.idle} idle, ${svc.creating} creating)`
	);
	console.log(`  ${tui.muted('Executions:')}      ${formatNumber(svc.totalExecutions)}`);
	console.log(`  ${tui.muted('CPU Time:')}        ${formatLatency(svc.totalCpuTimeMs)}`);
	console.log(`  ${tui.muted('Memory:')}          ${tui.formatBytes(svc.totalMemoryByteSec)}`);
	console.log(
		`  ${tui.muted('Network Out:')}     ${tui.formatBytes(svc.totalNetworkEgressBytes)}`
	);
}

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'View sandbox statistics',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox stats'),
			description: 'View sandbox statistics',
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
			service: 'sandbox',
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
