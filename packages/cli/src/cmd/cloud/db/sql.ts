import { z } from 'zod';
import { SQL } from 'bun';
import { listResources, type ResourceList } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

interface DatabaseResource {
	name: string;
	username?: string | null;
	password?: string | null;
	url?: string | null;
}

const DBSQLResponseSchema = z.object({
	rows: z.array(z.record(z.string(), z.unknown())).describe('Query results'),
	rowCount: z.number().describe('Number of rows returned'),
	executionTime: z.number().optional().describe('Query execution time in ms'),
});

export const sqlSubcommand = createSubcommand({
	name: 'sql',
	aliases: ['exec', 'query'],
	description: 'Execute SQL query on a database',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	idempotent: false,
	examples: [
		{
			command: `${getCommand('cloud db sql')} my-database "SELECT * FROM users LIMIT 10"`,
			description: 'Execute SQL query',
		},
		{
			command: `${getCommand('cloud db exec')} my-database "SELECT COUNT(*) FROM orders" --json`,
			description: 'Execute query with JSON output',
		},
		{
			command: `${getCommand('cloud db query')} my-database "SELECT * FROM products WHERE price > 100"`,
			description: 'Query with filter',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Database name'),
			query: z.string().describe('SQL query to execute'),
		}),
		options: z.object({}),
		response: DBSQLResponseSchema,
	},

	async handler(ctx) {
		const { logger, args, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const resources: ResourceList = await tui.spinner({
			message: `Fetching database ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		const db: DatabaseResource | undefined = resources.db.find(
			(d: DatabaseResource) => d.name === args.name
		);

		if (!db) {
			tui.fatal(`Database '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		if (!db.url) {
			tui.fatal(`Database '${args.name}' has no connection URL`, ErrorCode.RUNTIME_ERROR);
		}

		let database: SQL | undefined;
		let rows: Record<string, unknown>[];
		let executionTime: number | undefined;

		try {
			// Add sslmode=require if not already present in URL
			let connectionUrl = db.url;
			if (!connectionUrl.includes('sslmode=') && !connectionUrl.includes('ssl=')) {
				const separator = connectionUrl.includes('?') ? '&' : '?';
				connectionUrl = `${connectionUrl}${separator}sslmode=require`;
			}

			database = new SQL(connectionUrl);

			const startTime = performance.now();
			const result = await tui.spinner({
				message: `Executing query on ${args.name}`,
				clearOnSuccess: true,
				callback: async () => {
					return database!.unsafe(args.query);
				},
			});
			executionTime = performance.now() - startTime;

			rows = result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			tui.fatal(`Query execution failed: ${message}`, ErrorCode.RUNTIME_ERROR);
		} finally {
			if (database) {
				await database.close();
			}
		}

		if (!options.json) {
			if (rows.length === 0) {
				tui.info('No rows returned');
			} else {
				if (process.stdout.isTTY) {
					tui.newline();
					tui.success(
						`Query returned ${rows.length} row${rows.length !== 1 ? 's' : ''} (${executionTime?.toFixed(2)}ms):`
					);
					tui.newline();
				}

				tui.table(rows);
			}
		}

		return {
			rows,
			rowCount: rows.length,
			executionTime,
		};
	},
});
