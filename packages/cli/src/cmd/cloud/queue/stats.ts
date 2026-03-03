import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createQueueAPIClient, getQueueApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import {
	getOrgAnalytics,
	getQueueAnalytics,
	streamOrgAnalytics,
	streamQueueAnalytics,
	type OrgAnalytics,
	type QueueAnalytics,
	type SSEStatsEvent,
} from '@agentuity/server';

const StatsResponseSchema = z.union([
	z.object({ type: z.literal('org'), analytics: z.unknown() }),
	z.object({ type: z.literal('queue'), analytics: z.unknown() }),
	z.object({ type: z.literal('stream'), events: z.array(z.unknown()) }),
]);

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function formatPercent(n: number): string {
	return `${n.toFixed(2)}%`;
}

function formatLatency(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

function formatDuration(start: string, end: string): string {
	const startDate = new Date(start);
	const endDate = new Date(end);
	const hours = Math.round((endDate.getTime() - startDate.getTime()) / 3600000);
	if (hours >= 24) return `${Math.round(hours / 24)}d`;
	return `${hours}h`;
}

function displayOrgAnalytics(analytics: OrgAnalytics): void {
	const { summary, queues, period } = analytics;

	tui.header(`Organization Analytics (${formatDuration(period.start, period.end)})`);
	tui.newline();
	console.log(tui.colorPrimary('Summary:'));
	console.log(`  ${tui.muted('Total Queues:')}     ${summary.total_queues}`);
	console.log(
		`  ${tui.muted('Published:')}        ${formatNumber(summary.total_messages_published)}`
	);
	console.log(
		`  ${tui.muted('Delivered:')}        ${formatNumber(summary.total_messages_delivered)}`
	);
	console.log(
		`  ${tui.muted('Acknowledged:')}     ${formatNumber(summary.total_messages_acknowledged)}`
	);
	console.log(`  ${tui.muted('DLQ Messages:')}     ${formatNumber(summary.total_dlq_messages)}`);
	console.log(`  ${tui.muted('Avg Latency:')}      ${formatLatency(summary.avg_latency_ms)}`);
	console.log(`  ${tui.muted('P95 Latency:')}      ${formatLatency(summary.p95_latency_ms)}`);
	console.log(`  ${tui.muted('Error Rate:')}       ${formatPercent(summary.error_rate_percent)}`);

	if (queues.length > 0) {
		tui.newline();
		console.log(tui.colorPrimary('Queues:'));
		const tableData = queues.map((q) => ({
			Name: q.name,
			Type: q.queue_type,
			Published: formatNumber(q.messages_published),
			Delivered: formatNumber(q.messages_delivered),
			Backlog: formatNumber(q.backlog),
			DLQ: formatNumber(q.dlq_count),
			'Avg Latency': formatLatency(q.avg_latency_ms),
			'Error %': formatPercent(q.error_rate_percent),
		}));
		tui.table(tableData);
	}
}

function displayQueueAnalytics(analytics: QueueAnalytics): void {
	const { queue_name, queue_type, period, current, period_stats, latency, consumer_latency } =
		analytics;

	tui.header(`Queue: ${queue_name} (${queue_type})`);
	console.log(tui.colorWarning(`Period: ${formatDuration(period.start, period.end)}`));
	tui.newline();

	console.log(tui.colorPrimary('Current State:'));
	console.log(`  ${tui.muted('Backlog:')}          ${formatNumber(current.backlog)}`);
	console.log(`  ${tui.muted('In-Flight:')}        ${formatNumber(current.messages_in_flight)}`);
	console.log(`  ${tui.muted('DLQ:')}              ${formatNumber(current.dlq_count)}`);
	console.log(`  ${tui.muted('Consumers:')}        ${current.active_consumers}`);
	if (current.oldest_message_age_seconds != null) {
		console.log(`  ${tui.muted('Oldest Msg Age:')}   ${current.oldest_message_age_seconds}s`);
	}

	tui.newline();
	console.log(tui.colorPrimary('Period Stats:'));
	console.log(
		`  ${tui.muted('Published:')}          ${formatNumber(period_stats.messages_published)}`
	);
	console.log(
		`  ${tui.muted('Delivered:')}          ${formatNumber(period_stats.messages_delivered)}`
	);
	console.log(
		`  ${tui.muted('Acknowledged:')}       ${formatNumber(period_stats.messages_acknowledged)}`
	);
	console.log(
		`  ${tui.muted('Failed:')}             ${formatNumber(period_stats.messages_failed)}`
	);
	console.log(
		`  ${tui.muted('Replayed:')}           ${formatNumber(period_stats.messages_replayed)}`
	);
	console.log(
		`  ${tui.muted('Bytes Published:')}    ${tui.formatBytes(period_stats.bytes_published)}`
	);
	console.log(
		`  ${tui.muted('Delivery Attempts:')}  ${formatNumber(period_stats.delivery_attempts)}`
	);
	console.log(`  ${tui.muted('Retries:')}            ${formatNumber(period_stats.retry_count)}`);

	tui.newline();
	console.log(tui.colorPrimary('Delivery Latency:'));
	console.log(`  ${tui.muted('Average:')}          ${formatLatency(latency.avg_ms)}`);
	if (latency.p50_ms != null)
		console.log(`  ${tui.muted('Median (P50):')}     ${formatLatency(latency.p50_ms)}`);
	if (latency.p95_ms != null)
		console.log(`  ${tui.muted('P95:')}              ${formatLatency(latency.p95_ms)}`);
	if (latency.p99_ms != null)
		console.log(`  ${tui.muted('P99:')}              ${formatLatency(latency.p99_ms)}`);
	if (latency.max_ms != null)
		console.log(`  ${tui.muted('Max:')}              ${formatLatency(latency.max_ms)}`);

	tui.newline();
	console.log(tui.colorPrimary('Consumer Latency:'));
	console.log(`  ${tui.muted('Average:')}          ${formatLatency(consumer_latency.avg_ms)}`);
	if (consumer_latency.p50_ms != null)
		console.log(`  ${tui.muted('Median (P50):')}     ${formatLatency(consumer_latency.p50_ms)}`);
	if (consumer_latency.p95_ms != null)
		console.log(`  ${tui.muted('P95:')}              ${formatLatency(consumer_latency.p95_ms)}`);
	if (consumer_latency.p99_ms != null)
		console.log(`  ${tui.muted('P99:')}              ${formatLatency(consumer_latency.p99_ms)}`);

	if (analytics.destinations && analytics.destinations.length > 0) {
		tui.newline();
		tui.header('Destinations');
		const destData = analytics.destinations.map((d) => {
			const total = d.success_count + d.failure_count;
			const errorRate = total > 0 ? (d.failure_count / total) * 100 : 0;
			return {
				ID: d.id.slice(0, 12) + '...',
				URL: d.url.length > 40 ? d.url.slice(0, 37) + '...' : d.url,
				Success: formatNumber(d.success_count),
				Failed: formatNumber(d.failure_count),
				'Avg Response': d.avg_response_time_ms ? formatLatency(d.avg_response_time_ms) : '-',
				'Error %': formatPercent(errorRate),
			};
		});
		tui.table(destData);
	}
}

function displayStreamEvent(event: SSEStatsEvent, queueName?: string): void {
	const time = new Date(event.timestamp).toLocaleTimeString();
	const prefix = queueName ? `[${queueName}]` : '[org]';

	process.stdout.write('\x1b[2K\r');
	process.stdout.write(
		`${tui.colorMuted(time)} ${prefix} ` +
			`Backlog: ${tui.colorInfo(formatNumber(event.backlog))} | ` +
			`In-Flight: ${tui.colorInfo(formatNumber(event.messages_in_flight))} | ` +
			`Throughput: ${tui.colorSuccess(formatNumber(event.throughput_1m))}/min | ` +
			`Latency: ${formatLatency(event.avg_latency_ms)} | ` +
			`Errors: ${event.error_rate_1m > 0 ? tui.colorError(String(event.error_rate_1m)) : '0'}/min`
	);
}

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'View queue analytics and statistics',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud queue stats'),
			description: 'View org-level analytics for all queues',
		},
		{
			command: getCommand('cloud queue stats --name my-queue'),
			description: 'View detailed analytics for a specific queue',
		},
		{
			command: getCommand('cloud queue stats --live'),
			description: 'Stream real-time stats (Ctrl+C to exit)',
		},
		{
			command: getCommand('cloud queue stats --name my-queue --live --interval 10'),
			description: 'Stream queue stats every 10 seconds',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Queue name (omit for org-level stats)'),
		}),
		options: z.object({
			live: z.boolean().default(false).describe('Stream real-time stats'),
			interval: z.number().default(5).describe('Refresh interval in seconds (for --live)'),
			start: z.string().optional().describe('Start time (ISO 8601)'),
			end: z.string().optional().describe('End time (ISO 8601)'),
			granularity: z.enum(['minute', 'hour', 'day']).optional().describe('Time granularity'),
		}),
		response: StatsResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const apiOptions = getQueueApiOptions(ctx);

		const analyticsOptions = {
			...apiOptions,
			start: opts.start,
			end: opts.end,
			granularity: opts.granularity,
		};

		if (opts.live) {
			const events: SSEStatsEvent[] = [];

			tui.info(
				`Streaming stats every ${opts.interval}s... ${tui.colorMuted('(Ctrl+C to exit)')}`
			);
			tui.info('');

			const handleInterrupt = () => {
				tui.info('');
				tui.info('Stream stopped.');
				process.exit(0);
			};
			process.on('SIGINT', handleInterrupt);

			try {
				if (args.name) {
					const stream = streamQueueAnalytics(client, args.name, {
						interval: opts.interval,
						orgId: apiOptions?.orgId,
					});
					for await (const event of stream) {
						events.push(event);
						if (!options.json) {
							displayStreamEvent(event, args.name);
						}
					}
				} else {
					const stream = streamOrgAnalytics(client, {
						interval: opts.interval,
						orgId: apiOptions?.orgId,
					});
					for await (const event of stream) {
						events.push(event);
						if (!options.json) {
							displayStreamEvent(event);
						}
					}
				}
			} finally {
				process.off('SIGINT', handleInterrupt);
			}

			return { type: 'stream' as const, events };
		}

		if (args.name) {
			const analytics = await getQueueAnalytics(client, args.name, analyticsOptions);

			if (!options.json) {
				displayQueueAnalytics(analytics);
			}

			return { type: 'queue' as const, analytics };
		}

		const analytics = await getOrgAnalytics(client, analyticsOptions);

		if (!options.json) {
			displayOrgAnalytics(analytics);
		}

		return { type: 'org' as const, analytics };
	},
});

export default statsSubcommand;
