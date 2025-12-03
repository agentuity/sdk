import { z } from 'zod';
import { APIClient, APIError } from '../api';
import { DbInvalidArgumentError, DbResponseError } from './util';

const QueryColumnSchema = z.object({
	name: z.string().describe('column name'),
	type: z.string().describe('PostgreSQL data type OID'),
});

export const QueryResultSchema = z.object({
	columns: z.array(QueryColumnSchema).describe('column metadata'),
	rows: z.array(z.record(z.string(), z.any())).describe('query result rows'),
	rowCount: z.number().describe('number of rows returned'),
	truncated: z.boolean().describe('whether results were truncated (max 1000 rows)'),
});

const QueryResponseSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	data: QueryResultSchema.optional(),
});

export type QueryColumn = z.infer<typeof QueryColumnSchema>;
export type QueryResult = z.infer<typeof QueryResultSchema>;

interface DbQueryRequest {
	database: string;
	query: string;
	orgId: string;
	region: string;
}

export async function dbQuery(client: APIClient, request: DbQueryRequest): Promise<QueryResult> {
	const { database, query, orgId, region } = request;

	if (!orgId || !region) {
		throw new DbInvalidArgumentError({ message: 'orgId and region are required', orgId, region });
	}

	if (!query) {
		throw new DbInvalidArgumentError({ message: 'query is required', query });
	}

	const url = `/resource/2025-03-17/${orgId}/${region}/${database}/query`;

	try {
		const resp = await client.request('POST', url, QueryResponseSchema, { query });

		if (resp.success && resp.data) {
			return resp.data;
		}

		throw new DbResponseError({
			database,
			message: resp.message ?? 'Failed to execute database query',
		});
	} catch (ex) {
		if (ex instanceof APIError) {
			let message = ex.message;
			if (message?.startsWith('failed to execute query: ')) {
				message = message.substring(25);
			}
			throw new DbResponseError({ database, message });
		}
		throw ex;
	}
}
