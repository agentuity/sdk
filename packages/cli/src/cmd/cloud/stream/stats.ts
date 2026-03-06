import { getServiceStats, type ServiceStatsData } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { getGlobalCatalystAPIClient } from '../../../config';
import * as tui from '../../../tui';
import { createCommand } from '../../../types';

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function displayStats(data: ServiceStatsData): void {
	const svc = data.services.stream;
	if (!svc) {
		tui.info('No stream data found.');
		return;
	}
	tui.header('Stream Statistics');
	tui.newline();
	console.log(`  ${tui.muted('Streams:')}         ${formatNumber(svc.streamCount)}`);
	console.log(`  ${tui.muted('Total Size:')}      ${tui.formatBytes(svc.totalSizeBytes)}`);
}

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'View stream statistics',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud stream stats'),
			description: 'View stream statistics',
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
		const client = await getGlobalCatalystAPIClient(
			ctx.logger,
			ctx.auth,
			ctx.config?.name,
			undefined,
			ctx.config
		);
		const orgId = ctx.orgId ?? ctx.options.orgId ?? ctx.config?.preferences?.orgId;

		if (!orgId) {
			ctx.logger.fatal('Organization ID is required. Use --org-id or set a preferred org.');
			return;
		}

		const data = await getServiceStats(client, orgId, {
			service: 'stream',
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
