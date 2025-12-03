import { z } from 'zod';
import { createResources, APIError } from '@agentuity/server';
import { createSubcommand as defineSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import { ErrorCode } from '../../../errors';

export const createSubcommand = defineSubcommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new database resource',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		{ command: getCommand('cloud db create'), description: 'Create new item' },
		{ command: getCommand('cloud db new'), description: 'Run new command' },
		{ command: getCommand('cloud db create --name my-db'), description: 'Create new item' },
		{ command: getCommand('--dry-run cloud db create'), description: 'Create new item' },
	],
	schema: {
		options: z.object({
			name: z.string().optional().describe('Custom database name'),
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

		const catalystClient = getCatalystAPIClient(config, logger, auth, region);

		try {
			const created = await tui.spinner({
				message: `Creating database in ${region}`,
				clearOnSuccess: true,
				callback: async () => {
					return await createResources(catalystClient, orgId, region!, [
						{ type: 'db', name: opts.name },
					]);
				},
			});
			if (created.length > 0) {
				if (!options.json) {
					tui.success(`Created database: ${tui.bold(created[0].name)}`);
				}
				return {
					success: true,
					name: created[0].name,
				};
			} else {
				tui.fatal('Failed to create database');
			}
		} catch (ex) {
			if (ex instanceof APIError) {
				if (ex.status === 409) {
					const dbName = opts.name || 'auto-generated';
					tui.fatal(
						`database with the name "${dbName}" already exists. Use another name or don't specify --name for a unique name to be generated automatically.`,
						ErrorCode.INVALID_ARGUMENT
					);
				}
			}
			throw ex;
		}
	},
});
