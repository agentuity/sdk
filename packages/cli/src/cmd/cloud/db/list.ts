import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

const DBListResponseSchema = z.object({
	databases: z
		.array(
			z.object({
				name: z.string().describe('Database name'),
				url: z.string().optional().describe('Database connection URL'),
			})
		)
		.describe('List of database resources'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List database resources',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
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

	async handler(ctx) {
		const { logger, opts, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const resources = await tui.spinner({
			message: `Fetching databases for ${orgId} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		// Mask credentials in terminal output by default, unless --show-credentials is passed
		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		if (!options.json) {
			if (resources.db.length === 0) {
				tui.info('No databases found');
			} else {
				if (!opts.nameOnly) {
					tui.info(tui.bold('Databases'));
					tui.newline();
				}
				for (const db of resources.db) {
					if (opts.nameOnly) {
						console.log(db.name);
						continue;
					}
					console.log(tui.bold(db.name));
					if (db.url) {
						const displayUrl = shouldMask ? tui.maskSecret(db.url) : db.url;
						console.log(` URL: ${tui.muted(displayUrl)}`);
					}
					tui.newline();
				}
			}
		}

		return {
			databases: resources.db.map((db) => ({
				name: db.name,
				url: db.url ?? undefined,
			})),
		};
	},
});
