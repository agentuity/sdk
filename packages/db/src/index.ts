export {
	DbLogsAPIResponseSchema,
	DbLogsRequestSchema,
	DbLogsResponseSchema,
	type DbQueryLog,
	DbQueryLogSchema,
	type DbQueryLogs,
	dbLogs,
} from './logs.ts';
export {
	DbLogStatsAPIResponseSchema,
	DbLogStatsCommandBreakdownSchema,
	type DbLogStatsCommandBreakdown,
	DbLogStatsQueryPatternSchema,
	type DbLogStatsQueryPattern,
	DbLogStatsRequestSchema,
	DbLogStatsResponseSchema,
	type DbLogStatsResponse,
	DbLogStatsSummarySchema,
	type DbLogStatsSummary,
	DbLogStatsTimeSeriesPointSchema,
	type DbLogStatsTimeSeriesPoint,
	dbLogStats,
} from './stats.ts';
export {
	dbQuery,
	type QueryColumn,
	QueryColumnSchema,
	QueryResponseSchema,
	type QueryResult,
	QueryResultSchema,
} from './query.ts';
export {
	dbTables,
	generateCreateTableSQL,
	type TableColumn,
	TableColumnSchema,
	type TableSchema,
	TableSchemaSchema,
	TablesResponseSchema,
} from './tables.ts';
export { DbExecuteQueryRequestSchema, type DbExecuteQueryRequest } from './types.ts';
export { DbInvalidArgumentError, DbResponseError } from './util.ts';

import { APIClient } from '@agentuity/core/api';
import { getServiceUrls } from '@agentuity/config';
import {
	createMinimalLogger,
	isLogger,
	resolveApiKey,
	resolveRegion,
	resolveServiceUrl,
	type Logger,
} from '@agentuity/client';
import { z } from 'zod';
import { dbQuery, type QueryResult } from './query.ts';
import { dbTables, type TableSchema } from './tables.ts';
import { dbLogs, type DbQueryLogs } from './logs.ts';
import { dbLogStats, type DbLogStatsResponse } from './stats.ts';

export const DBClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the DB API'),
	database: z.string().describe('Database name'),
	orgId: z.string().describe('Organization ID'),
	region: z.string().optional().describe('Cloud region'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type DBClientOptions = z.infer<typeof DBClientOptionsSchema>;

export class DBClient {
	readonly #client: APIClient;
	readonly #database: string;
	readonly #orgId: string;
	readonly #region: string;

	constructor(options: DBClientOptions) {
		if (!options.database) {
			throw new Error('database is required for DBClient');
		}
		if (!options.orgId) {
			throw new Error('orgId is required for DBClient');
		}

		const apiKey = resolveApiKey(options.apiKey);
		const region = options.region || resolveRegion();
		const serviceUrls = getServiceUrls(region);
		const url = resolveServiceUrl({
			url: options.url,
			envKey: 'AGENTUITY_DB_URL',
			fallback: serviceUrls.catalyst,
		});
		const logger = options.logger ?? createMinimalLogger();

		this.#client = new APIClient(url, logger, apiKey ?? '');
		this.#database = options.database;
		this.#orgId = options.orgId;
		this.#region = region;
	}

	async query(sql: string): Promise<QueryResult> {
		return dbQuery(this.#client, {
			database: this.#database,
			query: sql,
			orgId: this.#orgId,
			region: this.#region,
		});
	}

	async tables(): Promise<TableSchema[]> {
		return dbTables(this.#client, {
			database: this.#database,
			orgId: this.#orgId,
			region: this.#region,
		});
	}

	async logs(params?: {
		startDate?: string;
		endDate?: string;
		limit?: number;
	}): Promise<DbQueryLogs> {
		return dbLogs(this.#client, {
			database: this.#database,
			orgId: this.#orgId,
			region: this.#region,
			...params,
		});
	}

	async stats(params: { startDate: string; endDate: string }): Promise<DbLogStatsResponse> {
		return dbLogStats(this.#client, {
			database: this.#database,
			orgId: this.#orgId,
			region: this.#region,
			...params,
		});
	}
}
