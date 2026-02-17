import { APIClient, APIResponseSchema } from '../api';
import {
	type UsageBreakdown,
	UsageBreakdownSchema,
	type UsageBreakdownOptions,
	type UsageOptions,
	type UsageSummary,
	UsageSummarySchema,
	type UsageTimeseries,
	UsageTimeseriesSchema,
	type UsageTimeseriesOptions,
} from './types';
import {
	buildUsageHeaders,
	createDefaultClient,
	resolveProjectId,
	UsageError,
	UsageNotFoundError,
	usageApiPath,
} from './util';

/**
 * Response schema for usage summary API responses.
 *
 * Wraps {@link UsageSummarySchema} in the standard API response envelope.
 */
export const UsageSummaryResponseSchema = APIResponseSchema(UsageSummarySchema);

/**
 * Response schema for usage breakdown API responses.
 *
 * Wraps {@link UsageBreakdownSchema} in the standard API response envelope.
 */
export const UsageBreakdownResponseSchema = APIResponseSchema(UsageBreakdownSchema);

/**
 * Response schema for usage timeseries API responses.
 *
 * Wraps {@link UsageTimeseriesSchema} in the standard API response envelope.
 */
export const UsageTimeseriesResponseSchema = APIResponseSchema(UsageTimeseriesSchema);

/**
 * Build query string from common usage options.
 */
function buildUsageQuery(options: UsageOptions): string {
	const params = new URLSearchParams();
	params.set('start', options.start);
	params.set('end', options.end);
	if (options.deploymentId) params.set('deploymentId', options.deploymentId);
	if (options.agentId) params.set('agentId', options.agentId);
	if (options.env) params.set('env', options.env);
	return params.toString();
}

/**
 * Get aggregated usage summary for a project within a time range.
 *
 * Returns total costs, token usage, CPU time, and session count aggregated
 * across all sessions in the project for the specified time range.
 *
 * Can be called three ways:
 * - `getUsageSummary(options)` — auto-constructs client and resolves project from environment
 * - `getUsageSummary(client, options)` — uses provided client, resolves project from environment
 * - `getUsageSummary(client, projectId, options)` — full manual control
 *
 * @throws {UsageNotFoundError} If the project is not found
 * @throws {UsageError} If the API request fails
 *
 * @example Zero-config (recommended when running inside Agentuity)
 * ```typescript
 * const summary = await getUsageSummary({
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 * });
 * console.log(`Total cost: $${summary.totalCost}`);
 * ```
 *
 * @example With explicit client
 * ```typescript
 * const summary = await getUsageSummary(client, {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 * });
 * ```
 *
 * @example With explicit client and project ID
 * ```typescript
 * const summary = await getUsageSummary(client, 'proj_abc123', {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 * });
 * console.log(`Sessions: ${summary.sessionCount}`);
 * console.log(`Tokens: ${summary.tokenUsage.totalTokens}`);
 * ```
 */
export async function getUsageSummary(options: UsageOptions): Promise<UsageSummary>;
export async function getUsageSummary(
	client: APIClient,
	options: UsageOptions
): Promise<UsageSummary>;
export async function getUsageSummary(
	client: APIClient,
	projectId: string,
	options: UsageOptions
): Promise<UsageSummary>;
export async function getUsageSummary(
	clientOrOptions: APIClient | UsageOptions,
	projectIdOrOptions?: string | UsageOptions,
	maybeOptions?: UsageOptions
): Promise<UsageSummary> {
	let client: APIClient;
	let projectId: string | undefined;
	let options: UsageOptions;

	if (clientOrOptions instanceof APIClient) {
		client = clientOrOptions;
		if (typeof projectIdOrOptions === 'string') {
			projectId = projectIdOrOptions;
			options = maybeOptions!;
		} else {
			options = projectIdOrOptions as UsageOptions;
		}
	} else {
		client = createDefaultClient();
		options = clientOrOptions;
	}

	const resolvedProjectId = resolveProjectId(projectId);
	const queryString = buildUsageQuery(options);
	const url = `${usageApiPath(resolvedProjectId, 'summary')}?${queryString}`;
	const resp = await client.get(
		url,
		UsageSummaryResponseSchema,
		undefined,
		buildUsageHeaders(options.orgId)
	);

	if (resp.success) {
		return resp.data;
	}

	if (resp.message?.includes('not found')) {
		throw new UsageNotFoundError({
			projectId: resolvedProjectId,
			message: resp.message,
		});
	}

	throw new UsageError({
		projectId: resolvedProjectId,
		message: resp.message || 'Failed to get usage summary',
	});
}

/**
 * Get usage data grouped by a dimension for a project.
 *
 * Returns cost data grouped by agent, deployment, day, or hour. Useful for
 * answering questions like "which agent costs the most?" or "daily spend trend".
 *
 * Can be called three ways:
 * - `getUsageBreakdown(options)` — auto-constructs client and resolves project from environment
 * - `getUsageBreakdown(client, options)` — uses provided client, resolves project from environment
 * - `getUsageBreakdown(client, projectId, options)` — full manual control
 *
 * @throws {UsageNotFoundError} If the project is not found
 * @throws {UsageError} If the API request fails
 *
 * @example Zero-config (recommended when running inside Agentuity)
 * ```typescript
 * const breakdown = await getUsageBreakdown({
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 *   groupBy: 'agent',
 *   sortBy: 'cost_desc',
 *   limit: 10,
 * });
 * ```
 *
 * @example With explicit client
 * ```typescript
 * const breakdown = await getUsageBreakdown(client, {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 *   groupBy: 'agent',
 *   sortBy: 'cost_desc',
 *   limit: 10,
 * });
 * ```
 *
 * @example With explicit client and project ID
 * ```typescript
 * const breakdown = await getUsageBreakdown(client, 'proj_abc123', {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-02-01T00:00:00Z',
 *   groupBy: 'agent',
 *   sortBy: 'cost_desc',
 *   limit: 10,
 * });
 * for (const group of breakdown.groups) {
 *   console.log(`${group.label}: $${group.totalCost} (${group.sessionCount} sessions)`);
 * }
 * ```
 */
export async function getUsageBreakdown(options: UsageBreakdownOptions): Promise<UsageBreakdown>;
export async function getUsageBreakdown(
	client: APIClient,
	options: UsageBreakdownOptions
): Promise<UsageBreakdown>;
export async function getUsageBreakdown(
	client: APIClient,
	projectId: string,
	options: UsageBreakdownOptions
): Promise<UsageBreakdown>;
export async function getUsageBreakdown(
	clientOrOptions: APIClient | UsageBreakdownOptions,
	projectIdOrOptions?: string | UsageBreakdownOptions,
	maybeOptions?: UsageBreakdownOptions
): Promise<UsageBreakdown> {
	let client: APIClient;
	let projectId: string | undefined;
	let options: UsageBreakdownOptions;

	if (clientOrOptions instanceof APIClient) {
		client = clientOrOptions;
		if (typeof projectIdOrOptions === 'string') {
			projectId = projectIdOrOptions;
			options = maybeOptions!;
		} else {
			options = projectIdOrOptions as UsageBreakdownOptions;
		}
	} else {
		client = createDefaultClient();
		options = clientOrOptions;
	}

	const resolvedProjectId = resolveProjectId(projectId);
	const params = new URLSearchParams();
	params.set('start', options.start);
	params.set('end', options.end);
	params.set('groupBy', options.groupBy);
	if (options.deploymentId) params.set('deploymentId', options.deploymentId);
	if (options.agentId) params.set('agentId', options.agentId);
	if (options.env) params.set('env', options.env);
	if (options.sortBy) params.set('sortBy', options.sortBy);
	if (options.limit !== undefined) params.set('limit', String(options.limit));

	const queryString = params.toString();
	const url = `${usageApiPath(resolvedProjectId, 'breakdown')}?${queryString}`;
	const resp = await client.get(
		url,
		UsageBreakdownResponseSchema,
		undefined,
		buildUsageHeaders(options.orgId)
	);

	if (resp.success) {
		return resp.data;
	}

	if (resp.message?.includes('not found')) {
		throw new UsageNotFoundError({
			projectId: resolvedProjectId,
			message: resp.message,
		});
	}

	throw new UsageError({
		projectId: resolvedProjectId,
		message: resp.message || 'Failed to get usage breakdown',
	});
}

/**
 * Get time-bucketed usage data for charting and visualization.
 *
 * Returns an ordered array of time buckets with selected metrics, suitable for
 * building cost and usage charts over time.
 *
 * Can be called three ways:
 * - `getUsageTimeseries(options)` — auto-constructs client and resolves project from environment
 * - `getUsageTimeseries(client, options)` — uses provided client, resolves project from environment
 * - `getUsageTimeseries(client, projectId, options)` — full manual control
 *
 * @throws {UsageNotFoundError} If the project is not found
 * @throws {UsageError} If the API request fails
 *
 * @example Zero-config (recommended when running inside Agentuity)
 * ```typescript
 * const timeseries = await getUsageTimeseries({
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-01-08T00:00:00Z',
 *   granularity: 'day',
 *   metrics: ['totalCost', 'llmCost', 'sessionCount'],
 * });
 * ```
 *
 * @example With explicit client
 * ```typescript
 * const timeseries = await getUsageTimeseries(client, {
 *   start: '2025-01-01T00:00:00Z',
 *   end: '2025-01-08T00:00:00Z',
 *   granularity: 'day',
 *   metrics: ['totalCost', 'llmCost', 'sessionCount'],
 * });
 * ```
 *
 * @example With explicit client and project ID
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
export async function getUsageTimeseries(options: UsageTimeseriesOptions): Promise<UsageTimeseries>;
export async function getUsageTimeseries(
	client: APIClient,
	options: UsageTimeseriesOptions
): Promise<UsageTimeseries>;
export async function getUsageTimeseries(
	client: APIClient,
	projectId: string,
	options: UsageTimeseriesOptions
): Promise<UsageTimeseries>;
export async function getUsageTimeseries(
	clientOrOptions: APIClient | UsageTimeseriesOptions,
	projectIdOrOptions?: string | UsageTimeseriesOptions,
	maybeOptions?: UsageTimeseriesOptions
): Promise<UsageTimeseries> {
	let client: APIClient;
	let projectId: string | undefined;
	let options: UsageTimeseriesOptions;

	if (clientOrOptions instanceof APIClient) {
		client = clientOrOptions;
		if (typeof projectIdOrOptions === 'string') {
			projectId = projectIdOrOptions;
			options = maybeOptions!;
		} else {
			options = projectIdOrOptions as UsageTimeseriesOptions;
		}
	} else {
		client = createDefaultClient();
		options = clientOrOptions;
	}

	const resolvedProjectId = resolveProjectId(projectId);
	const params = new URLSearchParams();
	params.set('start', options.start);
	params.set('end', options.end);
	params.set('granularity', options.granularity);
	if (options.deploymentId) params.set('deploymentId', options.deploymentId);
	if (options.agentId) params.set('agentId', options.agentId);
	if (options.env) params.set('env', options.env);
	if (options.metrics && options.metrics.length > 0) {
		params.set('metrics', options.metrics.join(','));
	}

	const queryString = params.toString();
	const url = `${usageApiPath(resolvedProjectId, 'timeseries')}?${queryString}`;
	const resp = await client.get(
		url,
		UsageTimeseriesResponseSchema,
		undefined,
		buildUsageHeaders(options.orgId)
	);

	if (resp.success) {
		return resp.data;
	}

	if (resp.message?.includes('not found')) {
		throw new UsageNotFoundError({
			projectId: resolvedProjectId,
			message: resp.message,
		});
	}

	throw new UsageError({
		projectId: resolvedProjectId,
		message: resp.message || 'Failed to get usage timeseries',
	});
}
