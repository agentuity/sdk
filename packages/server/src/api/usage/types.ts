import { z } from 'zod';

/**
 * Granularity schema for usage time buckets.
 *
 * - `minute`: 1-minute buckets, max range 24 hours. Best for real-time monitoring.
 * - `hour`: 1-hour buckets, max range 90 days. Best for short-term trend analysis.
 * - `day`: 1-day buckets, max range 365 days. Best for long-term analysis.
 *
 * @example
 * ```typescript
 * const granularity = UsageGranularitySchema.parse('hour'); // 'minute' | 'hour' | 'day'
 * ```
 */
export const UsageGranularitySchema = z.enum(['minute', 'hour', 'day']);

/**
 * Granularity type for usage time buckets.
 */
export type UsageGranularity = z.infer<typeof UsageGranularitySchema>;

/**
 * Sort options for usage breakdown results.
 *
 * - `cost_desc`: Highest cost first (default)
 * - `cost_asc`: Lowest cost first
 * - `sessions_desc`: Most sessions first
 *
 * @example
 * ```typescript
 * const sortBy = UsageSortBySchema.parse('cost_desc');
 * ```
 */
export const UsageSortBySchema = z.enum(['cost_desc', 'cost_asc', 'sessions_desc']);

/**
 * Sort option type for usage breakdown results.
 */
export type UsageSortBy = z.infer<typeof UsageSortBySchema>;

/**
 * Grouping dimension for usage breakdown queries.
 *
 * - `agent`: Group by agent ID
 * - `deployment`: Group by deployment ID
 * - `day`: Group by day (YYYY-MM-DD)
 * - `hour`: Group by hour (RFC 3339)
 *
 * @example
 * ```typescript
 * const groupBy = UsageGroupBySchema.parse('agent');
 * ```
 */
export const UsageGroupBySchema = z.enum(['agent', 'deployment', 'day', 'hour']);

/**
 * Grouping dimension type for usage breakdown queries.
 */
export type UsageGroupBy = z.infer<typeof UsageGroupBySchema>;

/**
 * Available metrics for usage timeseries queries.
 *
 * @example
 * ```typescript
 * const metric = UsageMetricSchema.parse('totalCost');
 * ```
 */
export const UsageMetricSchema = z.enum([
	'totalCost',
	'llmCost',
	'infraCost',
	'tokens',
	'promptTokens',
	'completionTokens',
	'cpuTimeMs',
	'sessionCount',
]);

/**
 * Usage metric type for timeseries queries.
 */
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

// ============================================================================
// Summary Response
// ============================================================================

/**
 * Token usage breakdown schema showing prompt, completion, and total token counts.
 *
 * @example
 * ```typescript
 * const tokens = TokenUsageSchema.parse({
 *   promptTokens: 1250000,
 *   completionTokens: 430000,
 *   totalTokens: 1680000,
 * });
 * ```
 */
export const TokenUsageSchema = z.object({
	/** Total prompt tokens consumed. */
	promptTokens: z.number().describe('Total prompt tokens consumed'),
	/** Total completion tokens consumed. */
	completionTokens: z.number().describe('Total completion tokens consumed'),
	/** Sum of prompt + completion tokens. */
	totalTokens: z.number().describe('Sum of prompt + completion tokens'),
});

/**
 * Token usage type.
 */
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Usage summary schema representing aggregated cost totals for a project within a time range.
 *
 * @example
 * ```typescript
 * const summary = await getUsageSummary(client, 'proj_abc123', {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 * });
 * console.log(`Total cost: $${summary.totalCost}`);
 * console.log(`Sessions: ${summary.sessionCount}`);
 * ```
 */
export const UsageSummarySchema = z.object({
	/** The project ID. */
	projectId: z.string().describe('The project ID'),
	/** Start of time range (RFC 3339). */
	start: z.string().describe('Start of time range (RFC 3339)'),
	/** End of time range (RFC 3339). */
	end: z.string().describe('End of time range (RFC 3339)'),
	/** Total cost (LLM + infra), rounded to 2 decimals. */
	totalCost: z.number().describe('Total cost (LLM + infra), rounded to 2 decimals'),
	/** LLM inference cost. */
	llmCost: z.number().describe('LLM inference cost'),
	/** Infrastructure cost (totalCost - llmCost, min 0). */
	infraCost: z.number().describe('Infrastructure cost (totalCost - llmCost, min 0)'),
	/** Token usage breakdown. */
	tokenUsage: TokenUsageSchema.describe('Token usage breakdown'),
	/** Total CPU time in milliseconds. */
	cpuTimeMs: z.number().describe('Total CPU time in milliseconds'),
	/** Number of sessions in the time range. */
	sessionCount: z.number().describe('Number of sessions in the time range'),
	/** Currency code, always "USD". */
	currency: z.string().describe('Currency code, always "USD"'),
});

/**
 * Usage summary type.
 */
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

// ============================================================================
// Breakdown Response
// ============================================================================

/**
 * Usage breakdown group schema representing cost data for a single group
 * (agent, deployment, or time bucket).
 *
 * @example
 * ```typescript
 * const group: UsageBreakdownGroup = {
 *   key: 'agent_xyz789',
 *   label: 'My Chat Agent',
 *   totalCost: 28.34,
 *   llmCost: 25.10,
 *   infraCost: 3.24,
 *   promptTokens: 800000,
 *   completionTokens: 290000,
 *   sessionCount: 1100,
 * };
 * ```
 */
export const UsageBreakdownGroupSchema = z.object({
	/** Group identifier (agent ID, deployment ID, or date). */
	key: z.string().describe('Group identifier (agent ID, deployment ID, or date)'),
	/** Human-readable label. */
	label: z.string().describe('Human-readable label'),
	/** Total cost for this group. */
	totalCost: z.number().describe('Total cost for this group'),
	/** LLM cost for this group. */
	llmCost: z.number().describe('LLM cost for this group'),
	/** Infra cost (totalCost - llmCost, min 0). */
	infraCost: z.number().describe('Infra cost (totalCost - llmCost, min 0)'),
	/** Prompt tokens consumed. */
	promptTokens: z.number().describe('Prompt tokens consumed'),
	/** Completion tokens consumed. */
	completionTokens: z.number().describe('Completion tokens consumed'),
	/** Number of sessions. */
	sessionCount: z.number().describe('Number of sessions'),
});

/**
 * Usage breakdown group type.
 */
export type UsageBreakdownGroup = z.infer<typeof UsageBreakdownGroupSchema>;

/**
 * Usage breakdown schema representing cost data grouped by a dimension.
 *
 * @example
 * ```typescript
 * const breakdown = await getUsageBreakdown(client, 'proj_abc123', {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 *   groupBy: 'agent',
 *   sortBy: 'cost_desc',
 *   limit: 10,
 * });
 * for (const group of breakdown.groups) {
 *   console.log(`${group.label}: $${group.totalCost}`);
 * }
 * ```
 */
export const UsageBreakdownSchema = z.object({
	/** The project ID. */
	projectId: z.string().describe('The project ID'),
	/** The dimension used for grouping. */
	groupBy: UsageGroupBySchema.describe('The dimension used for grouping'),
	/** Array of grouped cost data. */
	groups: z.array(UsageBreakdownGroupSchema).describe('Array of grouped cost data'),
});

/**
 * Usage breakdown type.
 */
export type UsageBreakdown = z.infer<typeof UsageBreakdownSchema>;

// ============================================================================
// Timeseries Response
// ============================================================================

/**
 * Usage timeseries bucket schema representing a single time-bucketed data point.
 *
 * Each bucket always contains `timestamp` (RFC 3339). Other numeric fields are
 * dynamically present based on the requested metrics.
 *
 * @example
 * ```typescript
 * const bucket: UsageTimeseriesBucket = {
 *   timestamp: '2025-01-01T00:00:00Z',
 *   totalCost: 5.23,
 *   llmCost: 4.80,
 *   sessionCount: 210,
 * };
 * ```
 */
export const UsageTimeseriesBucketSchema = z
	.object({
		/** RFC 3339 timestamp for the start of this bucket. */
		timestamp: z.string().describe('RFC 3339 timestamp for the start of this bucket'),
	})
	.catchall(z.number());

/**
 * Usage timeseries bucket type.
 */
export type UsageTimeseriesBucket = z.infer<typeof UsageTimeseriesBucketSchema>;

/**
 * Usage timeseries schema representing time-bucketed usage data for charting.
 *
 * @example
 * ```typescript
 * const timeseries = await getUsageTimeseries(client, 'proj_abc123', {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-01-08T00:00:00Z',
 *   granularity: 'day',
 *   metrics: ['totalCost', 'llmCost', 'sessionCount'],
 * });
 * for (const bucket of timeseries.buckets) {
 *   console.log(`${bucket.timestamp}: $${bucket.totalCost}`);
 * }
 * ```
 */
export const UsageTimeseriesSchema = z.object({
	/** The project ID. */
	projectId: z.string().describe('The project ID'),
	/** Bucket size used. */
	granularity: UsageGranularitySchema.describe('Bucket size used'),
	/** Metrics included in each bucket. */
	metrics: z.array(z.string()).describe('Metrics included in each bucket'),
	/** Array of time-bucketed data. */
	buckets: z.array(UsageTimeseriesBucketSchema).describe('Array of time-bucketed data'),
});

/**
 * Usage timeseries type.
 */
export type UsageTimeseries = z.infer<typeof UsageTimeseriesSchema>;

// ============================================================================
// Options Interfaces
// ============================================================================

/**
 * Common options for usage API calls.
 *
 * Used to specify the time range and optional filters when querying usage data.
 *
 * @example
 * ```typescript
 * const options: UsageOptions = {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 *   agentId: 'agent_xyz789',
 * };
 * const summary = await getUsageSummary(client, 'proj_abc123', options);
 * ```
 */
export interface UsageOptions {
	/**
	 * Start of time range in RFC 3339 format (required).
	 * @example '2025-01-01T00:00:00Z'
	 */
	start: string;

	/**
	 * End of time range in RFC 3339 format (required).
	 * @example '2025-02-01T00:00:00Z'
	 */
	end: string;

	/**
	 * Organization ID (required for CLI/user auth).
	 * Required when using user authentication (CLI) instead of SDK key.
	 */
	orgId?: string;

	/**
	 * Filter to a specific deployment.
	 */
	deploymentId?: string;

	/**
	 * Filter to a specific agent.
	 */
	agentId?: string;

	/**
	 * Filter to a specific environment.
	 */
	env?: string;
}

/**
 * Options for usage breakdown queries.
 *
 * Extends {@link UsageOptions} with grouping, sorting, and pagination parameters.
 *
 * @example
 * ```typescript
 * const options: UsageBreakdownOptions = {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 *   groupBy: 'agent',
 *   sortBy: 'cost_desc',
 *   limit: 10,
 * };
 * const breakdown = await getUsageBreakdown(client, 'proj_abc123', options);
 * ```
 */
export interface UsageBreakdownOptions extends UsageOptions {
	/**
	 * Grouping dimension (required).
	 */
	groupBy: UsageGroupBy;

	/**
	 * Sort order for results.
	 * @default 'cost_desc'
	 */
	sortBy?: UsageSortBy;

	/**
	 * Max groups to return (1-1000).
	 * @default 50
	 */
	limit?: number;
}

/**
 * Options for usage timeseries queries.
 *
 * Extends {@link UsageOptions} with granularity and metric selection parameters.
 *
 * @example
 * ```typescript
 * const options: UsageTimeseriesOptions = {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-01-08T00:00:00Z',
 *   granularity: 'day',
 *   metrics: ['totalCost', 'llmCost', 'sessionCount'],
 * };
 * const timeseries = await getUsageTimeseries(client, 'proj_abc123', options);
 * ```
 */
export interface UsageTimeseriesOptions extends UsageOptions {
	/**
	 * Bucket size (required).
	 */
	granularity: UsageGranularity;

	/**
	 * Metrics to include in each bucket.
	 * @default ['totalCost']
	 */
	metrics?: UsageMetric[];
}
