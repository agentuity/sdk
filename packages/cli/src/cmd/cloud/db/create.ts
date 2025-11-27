import { z } from 'zod';
import { createResources } from '@agentuity/server';
import { createSubcommand as defineSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';

export const createSubcommand = defineSubcommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new database resource',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		getCommand('cloud db create'),
		getCommand('cloud db new'),
		getCommand('--dry-run cloud db create'),
	],
	schema: {
		options: z.object({
			name: z.string().optional().describe('Custom database name (optional)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether creation succeeded'),
			name: z.string().describe('Created database name'),
		}),
	},

	async handler(ctx) {
		const { logger, opts, orgId, region, config, auth, options } = ctx;

		// Handle dry-run mode
		if (isDryRunMode(options)) {
			const message = opts.name
				? `Would create database with name: ${opts.name} in region: ${region}`
				: `Would create database in region: ${region}`;
			outputDryRun(message, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Database creation skipped');
			}
			return {
				success: false,
				name: opts.name || 'dry-run-db',
			};
		}

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const created = await tui.spinner({
			message: `Creating database in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return createResources(catalystClient, orgId, region!, [
					{ type: 'db', name: opts.name },
				]);
			},
		});

		if (created.length > 0) {
			tui.success(`Created database: ${tui.bold(created[0].name)}`);
			return {
				success: true,
				name: created[0].name,
			};
		} else {
			tui.fatal('Failed to create database');
		}
	},
});
