export {
	dbQuery,
	type QueryColumn,
	QueryColumnSchema,
	type QueryResult,
	QueryResultSchema,
	QueryResponseSchema,
} from '@agentuity/core/db';

export {
	dbTables,
	generateCreateTableSQL,
	type TableColumn,
	TableColumnSchema,
	type TableSchema,
	TableSchemaSchema,
	TablesResponseSchema,
} from '@agentuity/core/db';

export {
	dbLogs,
	type DbQueryLog,
	DbQueryLogSchema,
	type DbQueryLogs,
	DbLogsAPIResponseSchema,
	DbLogsRequestSchema,
	DbLogsResponseSchema,
} from '@agentuity/core/db';

export {
	dbLogStats,
	type DbLogStatsResponse,
	type DbLogStatsSummary,
	type DbLogStatsCommandBreakdown,
	type DbLogStatsQueryPattern,
	type DbLogStatsTimeSeriesPoint,
	DbLogStatsAPIResponseSchema,
	DbLogStatsCommandBreakdownSchema,
	DbLogStatsQueryPatternSchema,
	DbLogStatsRequestSchema,
	DbLogStatsResponseSchema,
	DbLogStatsSummarySchema,
	DbLogStatsTimeSeriesPointSchema,
} from '@agentuity/core/db';

export { DbInvalidArgumentError, DbResponseError } from '@agentuity/core/db';

import { APIClient } from '@agentuity/core/api';
import { createMinimalLogger, type Logger } from '@agentuity/core';
import { getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { z } from 'zod';
import {
	dbQuery,
	dbTables,
	dbLogs,
	dbLogStats,
	type QueryResult,
	type TableSchema,
	type DbQueryLogs,
	type DbLogStatsResponse,
} from '@agentuity/core/db';

export const DBClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the DB API'),
	database: z.string().describe('Database name'),
	orgId: z.string().describe('Organization ID'),
	region: z.string().optional().describe('Cloud region'),
	logger: z.custom<Logger>().optional().describe('Custom logger instance'),
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

		const apiKey = options.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
		const region = options.region || (getEnv('AGENTUITY_REGION') ?? 'usc');
		const serviceUrls = getServiceUrls(region);

		const url = options.url || getEnv('AGENTUITY_DB_URL') || serviceUrls.catalyst;

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
