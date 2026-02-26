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
	const svc = data.services.email;
	if (!svc) {
		tui.info('No email data found.');
		return;
	}
	tui.header('Email Statistics');
	tui.newline();
	console.log(
		`  ${tui.muted('Addresses:')}       ${formatNumber(svc.addressCount)}`
	);
	console.log(
		`  ${tui.muted('Inbound:')}         ${formatNumber(svc.inboundCount)}`
	);
	console.log(
		`  ${tui.muted('Outbound:')}        ${formatNumber(svc.outboundCount)} (${svc.outboundSuccess} ok, ${svc.outboundFailed} failed)`
	);
}

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'View email statistics',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud email stats'),
			description: 'View email statistics',
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
			service: 'email',
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
