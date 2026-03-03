import { z } from 'zod';
import { listOrgResources, dbTables, generateCreateTableSQL } from '@agentuity/server/index.ts';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getGlobalCatalystAPIClient, getCatalystAPIClient } from '../../../config.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { setResourceInfo } from '../../../cache/index.ts';

const DBGetResponseSchema = z
	.object({
		name: z.string().describe('Database name'),
		description: z.string().optional().describe('Database description'),
		url: z.string().optional().describe('Database connection URL'),
		org_id: z.string().optional().describe('Organization ID that owns this database'),
		org_name: z.string().optional().describe('Organization name that owns this database'),
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
	requires: { auth: true },
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
	webUrl: (ctx) => `/services/database/${encodeURIComponent(ctx.args.name)}`,

	async handler(ctx) {
		const { logger, args, opts, options, auth, config } = ctx;

		const profileName = config?.name ?? 'production';
		const globalClient = await getGlobalCatalystAPIClient(logger, auth, profileName);

		// Search across all orgs the user has access to
		const resources = await tui.spinner({
			message: `Fetching database ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return listOrgResources(globalClient, { type: 'db' });
			},
		});

		const db = resources.db.find((d) => d.name === args.name);

		// Cache the database info for future lookups
		if (db?.cloud_region && db.org_id) {
			await setResourceInfo('db', profileName, db.name, db.cloud_region, db.org_id);
		}

		if (!db) {
			tui.fatal(`Database '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		// If --tables flag is provided, fetch table schemas
		// Need regional Catalyst for database operations
		if (opts.showTables) {
			const region = db.cloud_region;
			const regionalClient = getCatalystAPIClient(logger, auth, region);

			// Validate org_id is present - dbTables requires orgId for authorization
			// Some internal databases may not have org_id set, which would fail the API call
			if (!db.org_id) {
				tui.fatal(
					`Database '${args.name}' is missing organization information and cannot be queried for tables`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}

			const tables = await tui.spinner({
				message: `Fetching table schemas for ${args.name}`,
				clearOnSuccess: true,
				callback: async () => {
					return dbTables(regionalClient, {
						database: args.name,
						orgId: db.org_id,
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
			const tableData: Record<string, string> = {
				Name: tui.bold(db.name),
			};
			if (db.org_name || db.org_id) {
				tableData['Organization'] = db.org_name || db.org_id;
			}
			if (db.description) {
				tableData['Description'] = db.description;
			}
			if (db.cloud_region) {
				tableData['Region'] = db.cloud_region;
			}
			if (db.url) {
				tableData['URL'] = shouldMask ? tui.maskSecret(db.url) : db.url;
			}

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			name: db.name,
			description: db.description ?? undefined,
			url: db.url ?? undefined,
			org_id: db.org_id,
			org_name: db.org_name,
		};
	},
});
