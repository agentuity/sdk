import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const DBGetResponseSchema = z.object({
	name: z.string().describe('Database name'),
	url: z.string().optional().describe('Database connection URL'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show'],
	description: 'Show details about a specific database',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	idempotent: true,
	examples: [
		`${getCommand('cloud db get')} my-database`,
		`${getCommand('cloud db show')} my-database`,
		`${getCommand('cloud db get')} my-database --show-credentials`,
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
		}),
		response: DBGetResponseSchema,
	},

	async handler(ctx) {
		const { logger, args, opts, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

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
