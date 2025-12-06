import { z } from 'zod';
import { listResources, deleteResources, APIError } from '@agentuity/server';
import enquirer from 'enquirer';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import { ErrorCode } from '../../../errors';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del'],
	description: 'Delete a database resource',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		{ command: getCommand('cloud db delete my-database'), description: 'Delete item' },
		{ command: getCommand('cloud db rm my-database'), description: 'Delete item' },
		{ command: getCommand('cloud db delete'), description: 'Delete item' },
		{ command: getCommand('--dry-run cloud db delete my-database'), description: 'Delete item' },
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Database name to delete'),
		}),
		options: z.object({
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether deletion succeeded'),
			name: z.string().describe('Deleted database name'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts, orgId, region, auth, options } = ctx;

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		let dbName = args.name;

		if (!dbName) {
			const resources = await tui.spinner({
				message: `Fetching databases for ${orgId} in ${region}`,
				clearOnSuccess: true,
				callback: async () => {
					return listResources(catalystClient, orgId, region!);
				},
			});

			if (resources.db.length === 0) {
				tui.info('No databases found to delete');
				return { success: false, name: '' };
			}

			const response = await enquirer.prompt<{ db: string }>({
				type: 'select',
				name: 'db',
				message: 'Select database to delete:',
				choices: resources.db.map((db) => ({
					name: db.name,
					message: db.name,
				})),
			});

			dbName = response.db;
		}

		// Handle dry-run mode
		if (isDryRunMode(options)) {
			outputDryRun(`Would delete database: ${dbName}`, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Database deletion skipped');
			}
			return {
				success: false,
				name: dbName,
			};
		}

		if (!opts.confirm) {
			tui.warning(`You are about to delete database: ${tui.bold(dbName)}`);

			const confirm = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: 'Are you sure you want to delete this database?',
				initial: false,
			});

			if (!confirm.confirm) {
				tui.info('Deletion cancelled');
				return { success: false, name: dbName };
			}
		}

		try {
			const deleted = await tui.spinner({
				message: `Deleting database ${dbName}`,
				clearOnSuccess: true,
				callback: async () => {
					return deleteResources(catalystClient, orgId, region!, [
						{ type: 'db', name: dbName },
					]);
				},
			});

			if (deleted.length > 0) {
				tui.success(`Deleted database: ${tui.bold(deleted[0])}`);
				return {
					success: true,
					name: deleted[0],
				};
			} else {
				tui.error('Failed to delete database');
				return { success: false, name: dbName };
			}
		} catch (ex) {
			if (ex instanceof APIError) {
				if (ex.status === 404) {
					tui.fatal(
						`database with the name "${dbName}" doesn't exist.`,
						ErrorCode.INVALID_ARGUMENT
					);
				}
			}
			throw ex;
		}
	},
});
