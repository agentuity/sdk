import { z } from 'zod';
import { listOrgResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getGlobalCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

const DBListResponseSchema = z.object({
	databases: z
		.array(
			z.object({
				name: z.string().describe('Database name'),
				description: z.string().optional().describe('Database description'),
				url: z.string().optional().describe('Database connection URL'),
				cloud_region: z.string().optional().describe('Cloud region where database is hosted'),
				org_id: z.string().optional().describe('Organization ID that owns this database'),
				org_name: z.string().optional().describe('Organization name that owns this database'),
			})
		)
		.describe('List of database resources'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List database resources',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud db list'), description: 'List items' },
		{ command: getCommand('--json cloud db list'), description: 'Show output in JSON format' },
		{ command: getCommand('cloud db ls'), description: 'List items' },
		{
			command: getCommand('cloud db list --show-credentials'),
			description: 'Use show credentials option',
		},
	],
	schema: {
		options: z.object({
			orgId: z.string().optional().describe('filter by organization id'),
			showCredentials: z
				.boolean()
				.optional()
				.describe(
					'Show credentials in plain text (default: masked in terminal, unmasked in JSON)'
				),
			nameOnly: z.boolean().optional().describe('Print the name only'),
		}),
		response: DBListResponseSchema,
	},
	webUrl: '/services/database',

	async handler(ctx) {
		const { logger, opts, options, auth, config } = ctx;

		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		const resources = await tui.spinner({
			message: 'Fetching databases',
			clearOnSuccess: true,
			callback: async () => {
				return listOrgResources(catalystClient, { type: 'db', orgId: opts?.orgId });
			},
		});

		// Mask credentials in terminal output by default, unless --show-credentials is passed
		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		// Check if resources span multiple orgs
		const uniqueOrgIds = new Set(resources.db.map((db) => db.org_id));
		const showOrgColumn = uniqueOrgIds.size > 1;

		if (!options.json) {
			if (resources.db.length === 0) {
				tui.info('No databases found');
			} else if (opts.nameOnly) {
				for (const db of resources.db) {
					console.log(db.name);
				}
			} else {
				const tableData = resources.db.map((db) => {
					const row: Record<string, string> = {
						Name: db.name,
					};
					if (showOrgColumn) {
						row.Organization = db.org_name || db.org_id;
					}
					row.Description = db.description ?? '';
					row.Region = db.cloud_region;
					row.URL = db.url ? (shouldMask ? tui.maskSecret(db.url) : db.url) : '';
					return row;
				});
				tui.table(tableData);
			}
		}

		return {
			databases: resources.db.map((db) => ({
				name: db.name,
				description: db.description ?? undefined,
				url: db.url ?? undefined,
				cloud_region: db.cloud_region,
				org_id: db.org_id,
				org_name: db.org_name,
			})),
		};
	},
});
