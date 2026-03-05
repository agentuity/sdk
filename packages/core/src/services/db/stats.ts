import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { DbInvalidArgumentError, DbResponseError } from './util.ts';

// Request schema
export const DbLogStatsRequestSchema = z.object({
	database: z.string().describe('the database name'),
	orgId: z.string().describe('the organization ID'),
	region: z.string().describe('the region'),
	startDate: z.string().describe('start date filter (ISO 8601)'),
	endDate: z.string().describe('end date filter (ISO 8601)'),
});

// Summary stats
export const DbLogStatsSummarySchema = z.object({
	totalQueries: z.number().describe('total number of queries'),
	errorCount: z.number().describe('number of queries with errors'),
	avgDuration: z.number().describe('average query duration in ms'),
	p50Duration: z.number().describe('50th percentile duration in ms'),
	p95Duration: z.number().describe('95th percentile duration in ms'),
	p99Duration: z.number().describe('99th percentile duration in ms'),
	maxDuration: z.number().describe('maximum query duration in ms'),
	totalRows: z.number().describe('total rows affected/returned'),
});

// Time series point
export const DbLogStatsTimeSeriesPointSchema = z.object({
	timestamp: z.string().describe('bucket timestamp'),
	queryCount: z.number().describe('queries in this bucket'),
	errorCount: z.number().describe('errors in this bucket'),
	avgDuration: z.number().describe('average duration in this bucket'),
	p50Duration: z.number().describe('p50 duration in this bucket'),
	p95Duration: z.number().describe('p95 duration in this bucket'),
	p99Duration: z.number().describe('p99 duration in this bucket'),
});

// Query pattern
export const DbLogStatsQueryPatternSchema = z.object({
	pattern: z.string().describe('SQL query text'),
	command: z.string().describe('SQL command type'),
	calls: z.number().describe('number of executions'),
	avgDuration: z.number().describe('average duration in ms'),
	p95Duration: z.number().describe('95th percentile duration in ms'),
	maxDuration: z.number().describe('maximum duration in ms'),
	totalDuration: z.number().describe('total cumulative duration in ms'),
	avgRows: z.number().describe('average rows affected'),
	errors: z.number().describe('number of errors'),
});

// Command breakdown
export const DbLogStatsCommandBreakdownSchema = z.object({
	command: z.string().describe('SQL command type'),
	queryCount: z.number().describe('number of queries'),
	avgDuration: z.number().describe('average duration in ms'),
	p95Duration: z.number().describe('95th percentile duration in ms'),
	totalDuration: z.number().describe('total cumulative duration in ms'),
	errorCount: z.number().describe('number of errors'),
});

// Combined response
export const DbLogStatsResponseSchema = z.object({
	summary: DbLogStatsSummarySchema,
	timeSeries: z.array(DbLogStatsTimeSeriesPointSchema),
	queryPatterns: z.array(DbLogStatsQueryPatternSchema),
	commandBreakdown: z.array(DbLogStatsCommandBreakdownSchema),
});

export const DbLogStatsAPIResponseSchema = APIResponseSchema(DbLogStatsResponseSchema);

// Type exports
export type DbLogStatsSummary = z.infer<typeof DbLogStatsSummarySchema>;
export type DbLogStatsTimeSeriesPoint = z.infer<typeof DbLogStatsTimeSeriesPointSchema>;
export type DbLogStatsQueryPattern = z.infer<typeof DbLogStatsQueryPatternSchema>;
export type DbLogStatsCommandBreakdown = z.infer<typeof DbLogStatsCommandBreakdownSchema>;
export type DbLogStatsResponse = z.infer<typeof DbLogStatsResponseSchema>;

type DbLogStatsRequest = z.infer<typeof DbLogStatsRequestSchema>;
type DbLogStatsAPIResponse = z.infer<typeof DbLogStatsAPIResponseSchema>;

/**
 * Get query performance stats for a database
 */
export async function dbLogStats(client: APIClient, request: DbLogStatsRequest): Promise<DbLogStatsResponse> {
	const { database, orgId, region, startDate, endDate } = request;

	if (!orgId || !region) {
		throw new DbInvalidArgumentError({ message: 'orgId and region are required', orgId, region });
	}

	const params = new URLSearchParams();
	params.append('startDate', startDate);
	params.append('endDate', endDate);

	const url = `/resource/${orgId}/${region}/${database}/logs/stats?${params.toString()}`;

	const resp = await client.get<DbLogStatsAPIResponse>(url, DbLogStatsAPIResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new DbResponseError({
		database,
		message: resp.message || 'Failed to fetch database performance stats',
	});
}
