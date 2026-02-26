import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getGlobalCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import {
	getServiceStats,
	VALID_SERVICES,
	type ServiceName,
	type ServiceStatsData,
} from '@agentuity/server';

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function formatLatency(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

function displayServiceStats(data: ServiceStatsData): void {
	tui.header('Service Statistics');

	const services = data.services;
	let hasData = false;

	if (services.keyvalue) {
		hasData = true;
		tui.newline();
		console.log(tui.colorPrimary('Key-Value:'));
		console.log(
			`  ${tui.muted('Namespaces:')}      ${formatNumber(services.keyvalue.namespaceCount)}`
		);
		console.log(
			`  ${tui.muted('Keys:')}            ${formatNumber(services.keyvalue.keyCount)}`
		);
		console.log(
			`  ${tui.muted('Total Size:')}      ${tui.formatBytes(services.keyvalue.totalSizeBytes)}`
		);
	}

	if (services.vector) {
		hasData = true;
		tui.newline();
		console.log(tui.colorPrimary('Vector:'));
		console.log(
			`  ${tui.muted('Namespaces:')}      ${formatNumber(services.vector.namespaceCount)}`
		);
		console.log(
			`  ${tui.muted('Documents:')}       ${formatNumber(services.vector.documentCount)}`
		);
		console.log(
			`  ${tui.muted('Total Size:')}      ${tui.formatBytes(services.vector.totalSizeBytes)}`
		);
	}

	if (services.queue) {
		hasData = true;
		tui.newline();
		console.log(tui.colorPrimary('Queue:'));
		console.log(
			`  ${tui.muted('Queues:')}          ${formatNumber(services.queue.queueCount)}`
		);
		console.log(
			`  ${tui.muted('Total Messages:')}  ${formatNumber(services.queue.totalMessages)}`
		);
		console.log(
			`  ${tui.muted('DLQ Messages:')}    ${formatNumber(services.queue.totalDlq)}`
		);
	}

	if (services.stream) {
		hasData = true;
		tui.newline();
		console.log(tui.colorPrimary('Stream:'));
		console.log(
			`  ${tui.muted('Streams:')}         ${formatNumber(services.stream.streamCount)}`
		);
		console.log(
			`  ${tui.muted('Total Size:')}      ${tui.formatBytes(services.stream.totalSizeBytes)}`
		);
	}

	if (services.sandbox) {
		hasData = true;
		const sb = services.sandbox;
		tui.newline();
		console.log(tui.colorPrimary('Sandbox:'));
		console.log(
			`  ${tui.muted('Active:')}          ${formatNumber(sb.totalActive)} (${sb.running} running, ${sb.idle} idle, ${sb.creating} creating)`
		);
		console.log(
			`  ${tui.muted('Executions:')}      ${formatNumber(sb.totalExecutions)}`
		);
		console.log(`  ${tui.muted('CPU Time:')}        ${formatLatency(sb.totalCpuTimeMs)}`);
		console.log(
			`  ${tui.muted('Memory:')}          ${tui.formatBytes(sb.totalMemoryByteSec)}`
		);
		console.log(
			`  ${tui.muted('Network Out:')}     ${tui.formatBytes(sb.totalNetworkEgressBytes)}`
		);
	}

	if (services.email) {
		hasData = true;
		const em = services.email;
		tui.newline();
		console.log(tui.colorPrimary('Email:'));
		console.log(
			`  ${tui.muted('Addresses:')}       ${formatNumber(em.addressCount)}`
		);
		console.log(
			`  ${tui.muted('Inbound:')}         ${formatNumber(em.inboundCount)}`
		);
		console.log(
			`  ${tui.muted('Outbound:')}        ${formatNumber(em.outboundCount)} (${em.outboundSuccess} ok, ${em.outboundFailed} failed)`
		);
	}

	if (services.task) {
		hasData = true;
		const tk = services.task;
		tui.newline();
		console.log(tui.colorPrimary('Task:'));
		console.log(`  ${tui.muted('Total:')}           ${formatNumber(tk.total)}`);
		console.log(`  ${tui.muted('Open:')}            ${formatNumber(tk.open)}`);
		console.log(
			`  ${tui.muted('In Progress:')}     ${formatNumber(tk.inProgress)}`
		);
		console.log(`  ${tui.muted('Closed:')}          ${formatNumber(tk.closed)}`);
	}

	if (services.schedule) {
		hasData = true;
		const sc = services.schedule;
		tui.newline();
		console.log(tui.colorPrimary('Schedule:'));
		console.log(
			`  ${tui.muted('Schedules:')}       ${formatNumber(sc.scheduleCount)}`
		);
		console.log(
			`  ${tui.muted('Deliveries:')}      ${formatNumber(sc.totalDeliveries)} (${sc.successDeliveries} ok, ${sc.failedDeliveries} failed)`
		);
	}

	if (services.database) {
		hasData = true;
		const db = services.database;
		tui.newline();
		console.log(tui.colorPrimary('Database:'));
		console.log(
			`  ${tui.muted('Databases:')}       ${formatNumber(db.databaseCount)}`
		);
		console.log(
			`  ${tui.muted('Tables:')}          ${formatNumber(db.totalTableCount)}`
		);
		console.log(
			`  ${tui.muted('Records:')}         ${formatNumber(db.totalRecordCount)}`
		);
		console.log(
			`  ${tui.muted('Total Size:')}      ${tui.formatBytes(db.totalSizeBytes)}`
		);
	}

	if (!hasData) {
		tui.info('No service usage data found.');
	}
}

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'View service usage statistics',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud services stats'),
			description: 'View stats for all services',
		},
		{
			command: getCommand('cloud services stats --service keyvalue'),
			description: 'View stats for key-value service only',
		},
	],
	schema: {
		options: z.object({
			service: z
				.string()
				.optional()
				.describe(`Service name to filter (${VALID_SERVICES.join(', ')})`),
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
			service: opts.service as ServiceName,
			start: opts.start,
			end: opts.end,
			orgIdHeader: orgId,
		});

		if (!options.json) {
			displayServiceStats(data);
		}

		return data;
	},
});

export default statsSubcommand;
