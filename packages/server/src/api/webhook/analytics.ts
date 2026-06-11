import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import {
	type WebhookAnalyticsOptions,
	type WebhookOrgAnalytics,
	WebhookOrgAnalyticsSchema,
	type WebhookTimeSeriesData,
	WebhookTimeSeriesDataSchema,
} from './types.ts';
import { buildWebhookHeaders, WebhookError, webhookApiPathWithQuery } from './util.ts';

export const WebhookOrgAnalyticsResponseSchema = APIResponseSchema(
	z.object({ analytics: WebhookOrgAnalyticsSchema })
);

export const WebhookTimeSeriesResponseSchema = APIResponseSchema(
	z.object({ timeseries: WebhookTimeSeriesDataSchema })
);

function buildAnalyticsQuery(options?: WebhookAnalyticsOptions): string | undefined {
	if (!options) return undefined;
	const params = new URLSearchParams();
	if (options.start) params.set('start', options.start);
	if (options.end) params.set('end', options.end);
	if (options.granularity) params.set('granularity', options.granularity);
	const query = params.toString();
	return query || undefined;
}

/**
 * Get org-level webhook analytics summary.
 *
 * Returns total received, delivered, and failed counts for all webhooks in the org
 * within the specified time period.
 *
 * @param client - The API client
 * @param options - Analytics options (start, end, granularity)
 * @returns Org-level webhook analytics
 */
export async function getWebhookOrgAnalytics(
	client: APIClient,
	options?: WebhookAnalyticsOptions
): Promise<WebhookOrgAnalytics> {
	const queryString = buildAnalyticsQuery(options);
	const url = webhookApiPathWithQuery('analytics/org', queryString);
	const resp = await client.get(
		url,
		WebhookOrgAnalyticsResponseSchema,
		undefined,
		buildWebhookHeaders(options?.orgId)
	);
	if (resp.success) return resp.data.analytics;
	throw new WebhookError({ message: resp.message || 'Failed to get webhook org analytics' });
}

/**
 * Get org-level webhook time series data.
 *
 * Returns time-bucketed received, delivered, and failed counts for all webhooks
 * in the org within the specified time period.
 *
 * @param client - The API client
 * @param options - Analytics options (start, end, granularity)
 * @returns Webhook time series data
 */
export async function getWebhookOrgTimeSeries(
	client: APIClient,
	options?: WebhookAnalyticsOptions
): Promise<WebhookTimeSeriesData> {
	const queryString = buildAnalyticsQuery(options);
	const url = webhookApiPathWithQuery('analytics/org/timeseries', queryString);
	const resp = await client.get(
		url,
		WebhookTimeSeriesResponseSchema,
		undefined,
		buildWebhookHeaders(options?.orgId)
	);
	if (resp.success) return resp.data.timeseries;
	throw new WebhookError({ message: resp.message || 'Failed to get webhook org time series' });
}
