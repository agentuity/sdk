import { z } from 'zod';
import { dbQuery } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

const DBSQLResponseSchema = z.object({
	rows: z.array(z.record(z.string(), z.unknown())).describe('Query results'),
	rowCount: z.number().describe('Number of rows returned'),
	truncated: z.boolean().describe('Whether results were truncated'),
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

		const result = await tui.spinner({
			message: `Executing query on ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return dbQuery(catalystClient, {
					database: args.name,
					query: args.query,
					orgId,
					region,
				});
			},
		});

		if (!options.json) {
			if (result.rowCount === 0) {
				tui.info('No rows returned');
			} else {
				if (process.stdout.isTTY) {
					tui.newline();
					tui.success(
						`Query returned ${result.rowCount} row${result.rowCount !== 1 ? 's' : ''}${result.truncated ? ' (truncated to 1000 rows)' : ''}:`
					);
					tui.newline();
				}

				tui.table(result.rows);
			}
		}

		return {
			rows: result.rows,
			rowCount: result.rowCount,
			truncated: result.truncated,
		};
	},
});
