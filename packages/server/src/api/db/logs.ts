import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { DbInvalidArgumentError, DbResponseError } from './util';

const _DbLogsRequestSchema = z.object({
	database: z.string().describe('the database name'),
	orgId: z.string().describe('the organization ID'),
	region: z.string().describe('the region'),
	startDate: z.string().optional().describe('start date filter'),
	endDate: z.string().optional().describe('end date filter'),
	username: z.string().optional().describe('username filter'),
	command: z.string().optional().describe('command filter'),
	hasError: z.boolean().optional().describe('filter by error status'),
	sessionId: z.string().optional().describe('filter by session ID (trace ID)'),
	limit: z.number().optional().describe('maximum number of logs to return'),
});

export const DbQueryLogSchema = z.object({
	timestamp: z.string().describe('log timestamp'),
	username: z.string().describe('username'),
	database: z.string().describe('database name'),
	duration: z.number().describe('query duration in milliseconds'),
	txStatus: z.string().describe('transaction status'),
	command: z.string().describe('SQL command type'),
	rowCount: z.number().describe('number of rows affected'),
	sql: z.string().describe('SQL query'),
	error: z.string().optional().describe('error message if any'),
	sessionId: z.string().optional().describe('session ID with sess_ prefix'),
});

const DbLogsResponse = z.array(DbQueryLogSchema);

const DbLogsResponseSchema = APIResponseSchema(DbLogsResponse);

type DbLogsRequest = z.infer<typeof _DbLogsRequestSchema>;
type DbLogsResponse = z.infer<typeof DbLogsResponseSchema>;

export type DbQueryLog = z.infer<typeof DbQueryLogSchema>;
export type DbQueryLogs = DbQueryLog[];

/**
 * Get query logs for a database from the App API
 *
 * @param client APIClient configured for the App API base URL
 * @param request
 * @returns
 */
export async function dbLogs(client: APIClient, request: DbLogsRequest): Promise<DbQueryLogs> {
	const { database, orgId, region, ...filters } = request;

	if (!orgId || !region) {
		throw new DbInvalidArgumentError({ message: 'orgId and region are required', orgId, region });
	}

	const params = new URLSearchParams();
	Object.entries(filters).forEach(([key, value]) => {
		if (value !== undefined) {
			params.append(key, String(value));
		}
	});

	const queryString = params.toString();
	const url = `/resource/2025-03-17/${orgId}/${region}/${database}/logs${queryString ? `?${queryString}` : ''}`;

	const resp = await client.request<DbLogsResponse>('GET', url, DbLogsResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new DbResponseError({
		database,
		message: resp.message || 'Failed to fetch database logs',
	});
}
