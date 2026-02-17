/**
 * @module usage
 *
 * Usage & Spending API client for querying project-level cost and usage data.
 *
 * This module provides typed client functions for the Agentuity Usage API,
 * which aggregates session cost data by project. It supports:
 * - **Summary**: Aggregated cost totals for a project within a time range
 * - **Breakdown**: Cost data grouped by agent, deployment, day, or hour
 * - **Timeseries**: Time-bucketed usage data for charting and visualization
 *
 * All costs are in USD. All timestamps are RFC 3339 format.
 *
 * @example Summary (zero-config)
 * ```typescript
 * import { getUsageSummary } from '@agentuity/server';
 *
 * const summary = await getUsageSummary({
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 * });
 * console.log(`Total cost: $${summary.totalCost}`);
 * ```
 *
 * @example Breakdown (zero-config)
 * ```typescript
 * import { getUsageBreakdown } from '@agentuity/server';
 *
 * const breakdown = await getUsageBreakdown({
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 *   groupBy: 'agent',
 *   sortBy: 'cost_desc',
 * });
 * for (const group of breakdown.groups) {
 *   console.log(`${group.label}: $${group.totalCost}`);
 * }
 * ```
 *
 * @example Timeseries (zero-config)
 * ```typescript
 * import { getUsageTimeseries } from '@agentuity/server';
 *
 * const timeseries = await getUsageTimeseries({
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-01-08T00:00:00Z',
 *   granularity: 'day',
 *   metrics: ['totalCost', 'sessionCount'],
 * });
 * for (const bucket of timeseries.buckets) {
 *   console.log(`${bucket.timestamp}: $${bucket.totalCost}`);
 * }
 * ```
 */

// ============================================================================
// Types & Schemas
// ============================================================================

export {
	type TokenUsage,
	TokenUsageSchema,
	type UsageBreakdown,
	type UsageBreakdownGroup,
	UsageBreakdownGroupSchema,
	type UsageBreakdownOptions,
	UsageBreakdownSchema,
	type UsageGranularity,
	UsageGranularitySchema,
	type UsageGroupBy,
	UsageGroupBySchema,
	type UsageMetric,
	UsageMetricSchema,
	type UsageOptions,
	type UsageSortBy,
	UsageSortBySchema,
	type UsageSummary,
	UsageSummarySchema,
	type UsageTimeseries,
	type UsageTimeseriesBucket,
	UsageTimeseriesBucketSchema,
	type UsageTimeseriesOptions,
	UsageTimeseriesSchema,
} from './types';

// ============================================================================
// Errors
// ============================================================================

export { createDefaultClient, UsageError, UsageNotFoundError } from './util';

// ============================================================================
// Usage Operations
// ============================================================================

export {
	getUsageBreakdown,
	getUsageSummary,
	getUsageTimeseries,
	UsageBreakdownResponseSchema,
	UsageSummaryResponseSchema,
	UsageTimeseriesResponseSchema,
} from './usage';
