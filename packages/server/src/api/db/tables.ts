import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { DbInvalidArgumentError, DbResponseError } from './util';

const TableColumnSchema = z.object({
	name: z.string().describe('column name'),
	data_type: z.string().describe('PostgreSQL data type'),
	is_nullable: z.boolean().describe('whether the column is nullable'),
	default_value: z.string().optional().describe('default value'),
	is_primary_key: z.boolean().describe('whether this column is part of the primary key'),
});

export const TableSchemaSchema = z.object({
	table_name: z.string().describe('table name'),
	columns: z.array(TableColumnSchema).describe('table columns'),
});

const TablesResponseSchema = APIResponseSchema(
	z.object({
		tables: z.array(TableSchemaSchema),
	})
);

export type TableColumn = z.infer<typeof TableColumnSchema>;
export type TableSchema = z.infer<typeof TableSchemaSchema>;

interface DbTablesRequest {
	database: string;
	orgId: string;
	region: string;
}

export async function dbTables(
	client: APIClient,
	request: DbTablesRequest
): Promise<TableSchema[]> {
	const { database, orgId, region } = request;

	if (!orgId || !region) {
		throw new DbInvalidArgumentError({ message: 'orgId and region are required', orgId, region });
	}

	const url = `/resource/2025-03-17/${orgId}/${region}/${database}/tables`;

	const resp = await client.get(url, TablesResponseSchema);

	if (resp.success) {
		return resp.data.tables;
	}

	throw new DbResponseError({
		database,
		message: resp.message || 'Failed to fetch database tables',
	});
}

export function generateCreateTableSQL(table: TableSchema): string {
	const lines: string[] = [`CREATE TABLE ${table.table_name} (`];

	// Collect primary key columns
	const primaryKeyColumns: string[] = [];

	const columnDefs = table.columns.map((col) => {
		let def = `    ${col.name} ${col.data_type}`;

		if (!col.is_nullable) {
			def += ' NOT NULL';
		}

		if (col.default_value) {
			def += ` DEFAULT ${col.default_value}`;
		}

		if (col.is_primary_key) {
			primaryKeyColumns.push(col.name);
		}

		return def;
	});

	lines.push(columnDefs.join(',\n'));

	// Add table-level PRIMARY KEY constraint if any columns are marked as primary keys
	if (primaryKeyColumns.length > 0) {
		lines.push(',');
		lines.push(`    PRIMARY KEY (${primaryKeyColumns.join(', ')})`);
	}

	lines.push(');');

	return lines.join('\n');
}
