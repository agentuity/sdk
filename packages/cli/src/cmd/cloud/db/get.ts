import { z } from 'zod';
import { listResources, dbTables, generateCreateTableSQL } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const DBGetResponseSchema = z
	.object({
		name: z.string().describe('Database name'),
		url: z.string().optional().describe('Database connection URL'),
	})
	.or(
		z.object({
			tables: z.union([z.array(z.string()), z.array(z.any())]).describe('Table information'),
		})
	);

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show'],
	description: 'Show details about a specific database',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	idempotent: true,
	examples: [
		{ command: `${getCommand('cloud db get')} my-database`, description: 'Get database details' },
		{
			command: `${getCommand('cloud db show')} my-database`,
			description: 'Show database information',
		},
		{
			command: `${getCommand('cloud db get')} my-database --show-credentials`,
			description: 'Get database with credentials',
		},
		{
			command: `${getCommand('cloud db get')} my-database --show-tables`,
			description: 'Get table schemas from the database',
		},
		{
			command: `${getCommand('cloud db get')} my-database --show-tables --sql`,
			description: 'Get table schemas as SQL CREATE statements',
		},
		{
			command: `${getCommand('cloud db get')} my-database --show-tables --json`,
			description: 'Get table schemas as JSON',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Database name'),
		}),
		options: z.object({
			showCredentials: z
				.boolean()
				.optional()
				.describe(
					'Show credentials in plain text (default: masked in terminal, unmasked in JSON)'
				),
			showTables: z.boolean().optional().describe('Fetch table schemas from the database'),
			sql: z.boolean().optional().describe('Output table schemas as SQL CREATE statements'),
		}),
		response: DBGetResponseSchema,
	},

	async handler(ctx) {
		const { logger, args, opts, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth, region);

		const resources = await tui.spinner({
			message: `Fetching database ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		const db = resources.db.find((d) => d.name === args.name);

		if (!db) {
			tui.fatal(`Database '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		// If --tables flag is provided, fetch table schemas
		if (opts.showTables) {
			const tables = await tui.spinner({
				message: `Fetching table schemas for ${args.name}`,
				clearOnSuccess: true,
				callback: async () => {
					return dbTables(catalystClient, {
						database: args.name,
						orgId,
						region,
					});
				},
			});

			if (!tables || tables.length === 0) {
				if (!options.json) {
					tui.info(`No tables found in database '${args.name}'`);
				}
				return {
					name: args.name,
					url: db.url ?? undefined,
				};
			}

			// --sql option: output CREATE TABLE statements
			if (opts.sql) {
				if (options.json) {
					return { tables: tables.map(generateCreateTableSQL) };
				}

				for (const table of tables) {
					console.log(generateCreateTableSQL(table));
					console.log('');
				}
				return { tables: tables.map((t) => t.table_name) };
			}

			// --json option: return raw table schemas
			if (options.json) {
				return { tables };
			}

			// Default: display as tables using tui.table
			for (const table of tables) {
				console.log(tui.bold(`\nTable: ${table.table_name}`));

				const tableData = table.columns.map((col) => ({
					Column: col.name,
					Type: col.data_type,
					Nullable: col.is_nullable ? 'YES' : 'NO',
					Default: col.default_value || '',
					'Primary Key': col.is_primary_key ? 'YES' : '',
				}));

				tui.table(tableData);
			}

			return { tables: tables.map((t) => t.table_name) };
		}

		// Mask credentials in terminal output by default, unless --show-credentials is passed
		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		if (!options.json) {
			console.log(tui.bold('Name: ') + db.name);
			if (db.url) {
				const displayUrl = shouldMask ? tui.maskSecret(db.url) : db.url;
				console.log(tui.bold('URL:  ') + displayUrl);
			}
		}

		return {
			name: db.name,
			url: db.url ?? undefined,
		};
	},
});
