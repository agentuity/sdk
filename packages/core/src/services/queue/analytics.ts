import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import {
	type AnalyticsOptions,
	type OrgAnalytics,
	OrgAnalyticsSchema,
	type QueueAnalytics,
	QueueAnalyticsSchema,
	type SSEStatsEvent,
	SSEStatsEventSchema,
	type StreamAnalyticsOptions,
	type TimeSeriesData,
	TimeSeriesDataSchema,
} from './types.ts';
import {
	buildQueueHeaders,
	QueueError,
	QueueNotFoundError,
	queueApiPathWithQuery,
	withQueueErrorHandling,
} from './util.ts';
import { validateQueueName } from './validation.ts';

export const OrgAnalyticsResponseSchema = APIResponseSchema(
	z.object({ analytics: OrgAnalyticsSchema })
);
export const QueueAnalyticsResponseSchema = APIResponseSchema(
	z.object({ analytics: QueueAnalyticsSchema })
);
export const TimeSeriesResponseSchema = APIResponseSchema(
	z.object({ timeseries: TimeSeriesDataSchema })
);

/**
 * Build query string from analytics options.
 */
function buildAnalyticsQuery(options?: AnalyticsOptions): string | undefined {
	if (!options) return undefined;

	const params = new URLSearchParams();
	if (options.start) params.set('start', options.start);
	if (options.end) params.set('end', options.end);
	if (options.granularity) params.set('granularity', options.granularity);
	if (options.projectId) params.set('project_id', options.projectId);
	if (options.agentId) params.set('agent_id', options.agentId);

	const query = params.toString();
	return query || undefined;
}

/**
 * Get org-level analytics for all queues.
 *
 * Returns aggregated statistics across all queues in the organization.
 *
 * @param client - The API client instance
 * @param options - Analytics options (time range, filters)
 * @returns Org-level analytics summary
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const analytics = await getOrgAnalytics(client, {
 *   start: '2026-01-14T00:00:00Z',
 *   end: '2026-01-15T00:00:00Z',
 * });
 * console.log(`Total queues: ${analytics.summary.total_queues}`);
 * console.log(`Messages published: ${analytics.summary.total_messages_published}`);
 * ```
 */
export async function getOrgAnalytics(
	client: APIClient,
	options?: AnalyticsOptions
): Promise<OrgAnalytics> {
	const queryString = buildAnalyticsQuery(options);
	const url = queueApiPathWithQuery('analytics/org', queryString);
	const resp = await client.get(
		url,
		OrgAnalyticsResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.analytics;
	}

	throw new QueueError({
		message: resp.message || 'Failed to get org analytics',
	});
}

/**
 * Get org-level time series analytics.
 *
 * Returns published and delivery metrics aggregated across all queues.
 *
 * @param client - The API client instance
 * @param options - Analytics options (time range, filters)
 * @returns Time series analytics data for the org
 * @throws {QueueError} If the API request fails
 */
export async function getOrgTimeSeries(
	client: APIClient,
	options?: AnalyticsOptions
): Promise<TimeSeriesData> {
	const queryString = buildAnalyticsQuery(options);
	const url = queueApiPathWithQuery('analytics/org/timeseries', queryString);
	const resp = await client.get(
		url,
		TimeSeriesResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.timeseries;
	}

	throw new QueueError({
		message: resp.message || 'Failed to get org time series',
	});
}

/**
 * Get detailed analytics for a specific queue.
 *
 * Returns current state, period statistics, latency metrics, and destination stats.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @param options - Analytics options (time range, filters)
 * @returns Queue analytics
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const analytics = await getQueueAnalytics(client, 'order-processing', {
 *   start: '2026-01-14T00:00:00Z',
 * });
 * console.log(`Backlog: ${analytics.current.backlog}`);
 * console.log(`P95 latency: ${analytics.latency.p95_ms}ms`);
 * ```
 */
export async function getQueueAnalytics(
	client: APIClient,
	name: string,
	options?: AnalyticsOptions
): Promise<QueueAnalytics> {
	validateQueueName(name);
	const queryString = buildAnalyticsQuery(options);
	const url = queueApiPathWithQuery('analytics/queue', queryString, name);
	const resp = await withQueueErrorHandling(
		() =>
			client.get(
				url,
				QueueAnalyticsResponseSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName: name }
	);

	if (resp.success) {
		return resp.data.analytics;
	}

	throw new QueueError({
		queueName: name,
		message: resp.message || 'Failed to get queue analytics',
	});
}

/**
 * Get time series analytics data for a queue.
 *
 * Returns time-bucketed metrics for visualization in charts and graphs.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @param options - Analytics options (time range, granularity)
 * @returns Time series data
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const timeseries = await getQueueTimeSeries(client, 'order-processing', {
 *   granularity: 'hour',
 *   start: '2026-01-14T00:00:00Z',
 * });
 * for (const point of timeseries.series) {
 *   console.log(`${point.timestamp}: ${point.throughput} msg/h`);
 * }
 * ```
 */
export async function getQueueTimeSeries(
	client: APIClient,
	name: string,
	options?: AnalyticsOptions
): Promise<TimeSeriesData> {
	validateQueueName(name);
	const queryString = buildAnalyticsQuery(options);
	const url = queueApiPathWithQuery('analytics/timeseries', queryString, name);
	const resp = await withQueueErrorHandling(
		() => client.get(url, TimeSeriesResponseSchema, undefined, buildQueueHeaders(options?.orgId)),
		{ queueName: name }
	);

	if (resp.success) {
		return resp.data.timeseries;
	}

	throw new QueueError({
		queueName: name,
		message: resp.message || 'Failed to get queue time series',
	});
}

/**
 * Stream real-time analytics for all queues via SSE.
 *
 * Returns an async iterator that yields stats events at the specified interval.
 * The connection stays open until the iterator is closed or an error occurs.
 *
 * @param client - The API client instance
 * @param options - Stream options (interval, orgId)
 * @returns Async iterator of SSE stats events
 *
 * @example
 * ```typescript
 * const stream = streamOrgAnalytics(client, { interval: 5 });
 * for await (const event of stream) {
 *   console.log(`Backlog: ${event.backlog}, Throughput: ${event.throughput_1m}/min`);
 * }
 * ```
 */
export async function* streamOrgAnalytics(
	client: APIClient,
	options?: StreamAnalyticsOptions
): AsyncGenerator<SSEStatsEvent, void, unknown> {
	const params = new URLSearchParams();
	if (options?.interval) params.set('interval', String(options.interval));
	const queryString = params.toString() || undefined;

	const url = queueApiPathWithQuery('analytics/stream', queryString);

	yield* streamSSE(client, url, options?.orgId);
}

/**
 * Stream real-time analytics for a specific queue via SSE.
 *
 * Returns an async iterator that yields stats events at the specified interval.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @param options - Stream options (interval, orgId)
 * @returns Async iterator of SSE stats events
 *
 * @example
 * ```typescript
 * const stream = streamQueueAnalytics(client, 'order-processing', { interval: 5 });
 * for await (const event of stream) {
 *   console.log(`Backlog: ${event.backlog}, In-flight: ${event.messages_in_flight}`);
 * }
 * ```
 */
export async function* streamQueueAnalytics(
	client: APIClient,
	name: string,
	options?: StreamAnalyticsOptions
): AsyncGenerator<SSEStatsEvent, void, unknown> {
	validateQueueName(name);

	const params = new URLSearchParams();
	if (options?.interval) params.set('interval', String(options.interval));
	const queryString = params.toString() || undefined;

	const url = queueApiPathWithQuery('analytics/stream', queryString, name);

	yield* streamSSE(client, url, options?.orgId, name);
}

/**
 * Internal helper to stream SSE events from a URL.
 * Uses rawGet for streaming response access.
 */
async function* streamSSE(
	client: APIClient,
	url: string,
	orgId?: string,
	queueName?: string
): AsyncGenerator<SSEStatsEvent, void, unknown> {
	const response = await client.rawGet(url, undefined, buildQueueHeaders(orgId));

	if (!response.ok) {
		if (response.status === 404 && queueName) {
			throw new QueueNotFoundError({ queueName });
		}
		throw new QueueError({
			message: `SSE connection failed: ${response.status} ${response.statusText}`,
		});
	}

	const reader = response.body?.getReader();
	if (!reader) {
		throw new QueueError({ message: 'No response body for SSE stream' });
	}

	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const jsonStr = line.slice(6).trim();
					if (jsonStr && jsonStr !== '{}') {
						try {
							const parsed = JSON.parse(jsonStr);
							const event = SSEStatsEventSchema.parse(parsed);
							yield event;
						} catch {
							// Skip malformed events
						}
					}
				}
			}
		}
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
}
