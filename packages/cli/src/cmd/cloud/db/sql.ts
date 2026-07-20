import { dbQuery } from '@agentuity/db';
import { listOrgResources } from '@agentuity/server';
import { z } from 'zod';
import { setResourceInfo } from '../../../cache/index.ts';
import { getCommand } from '../../../command-prefix.ts';
import { getCatalystAPIClient, getGlobalCatalystAPIClient } from '../../../config.ts';
import { ErrorCode } from '../../../errors.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';

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
	requires: { auth: true },
	idempotent: false,
	resourceRules: [
		{
			resource: 'org',
			required: false,
			flag: 'org-id',
			envVar: 'AGENTUITY_CLOUD_ORG_ID',
			canUseCache: true,
		},
		{
			resource: 'region',
			required: false,
			flag: 'region',
			envVar: 'AGENTUITY_REGION',
			operationType: 'read',
		},
	],
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
		const { logger, args, options, auth, config } = ctx;

		const profileName = config?.name ?? 'production';

		// `db sql` targets a named database, so resolve that database's own region
		// rather than the ambient CLI region. The ambient region can point at a
		// different region than the database lives in, which makes the query fail
		// with "Not Found" (the same global-lookup pattern used by `db get`/`db wal`).
		const globalClient = await getGlobalCatalystAPIClient(
			logger,
			auth,
			profileName,
			undefined,
			config
		);

		const resources = await tui.spinner({
			message: `Looking up database ${args.name}`,
			clearOnSuccess: true,
			callback: async () => listOrgResources(globalClient, { type: 'db', name: args.name }),
		});

		const db = resources.db.find((d) => d.name === args.name);
		if (!db) {
			tui.fatal(`Database '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		const region = db.cloud_region;
		const orgId = db.org_id;

		// Cache the resolved region so later commands can skip the org resource scan.
		await setResourceInfo('db', profileName, db.name, region, orgId);

		const catalystClient = getCatalystAPIClient(logger, auth, region, orgId, config);

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
