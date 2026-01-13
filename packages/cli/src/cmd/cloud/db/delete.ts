import { z } from 'zod';
import { listOrgResources, deleteResources, APIError } from '@agentuity/server';
import enquirer from 'enquirer';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getGlobalCatalystAPIClient, getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import { ErrorCode } from '../../../errors';
import { removeResourceEnvVars } from '../../../env-util';
import { getResourceInfo, setResourceInfo, deleteResourceRegion } from '../../../cache';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del'],
	description: 'Delete a database resource',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true },
	optional: { org: true },
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
		const { logger, args, opts, auth, options, config } = ctx;

		const profileName = config?.name ?? 'production';
		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, profileName);

		let dbName = args.name;

		// If db name provided, try cache first for orgId
		let orgId = ctx.orgId;
		if (dbName && !orgId) {
			const cachedInfo = await getResourceInfo('db', profileName, dbName);
			orgId = cachedInfo?.orgId;
		}

		// For interactive selection (no db name), we need orgId
		if (!dbName && !orgId) {
			tui.fatal(
				'Organization required for interactive database selection. Specify --org-id or provide database name.',
				ErrorCode.INVALID_ARGUMENT
			);
		}

		// If we still don't have orgId and have a db name, error out
		if (!orgId) {
			tui.fatal(
				`Organization not found for database '${dbName}'. Run 'agentuity cloud db list' first or specify --org-id.`,
				ErrorCode.INVALID_ARGUMENT
			);
		}

		// Fetch all databases to get region info
		const resources = await tui.spinner({
			message: `Fetching databases for ${orgId}`,
			clearOnSuccess: true,
			callback: async () => {
				return listOrgResources(catalystClient, { type: 'db', orgId });
			},
		});

		// Cache all fetched databases
		for (const db of resources.db) {
			await setResourceInfo('db', profileName, db.name, db.cloud_region, orgId);
		}

		if (!dbName) {
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

		// Find the database to get its region
		const database = resources.db.find((db) => db.name === dbName);
		if (!database) {
			tui.fatal(`Database '${dbName}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}
		const region = database.cloud_region;

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
			// Use regional client for the delete operation
			const regionalClient = getCatalystAPIClient(logger, auth, region);
			const deleted = await tui.spinner({
				message: `Deleting database ${dbName}`,
				clearOnSuccess: true,
				callback: async () => {
					return deleteResources(regionalClient, orgId, region, [
						{ type: 'db', name: dbName },
					]);
				},
			});

			if (deleted.length > 0) {
				const resource = deleted[0];

				// Clear cache entry for deleted database
				await deleteResourceRegion('db', profileName, resource.name);

				// Remove env vars from .env if running inside a project
				if (ctx.projectDir && resource.env_keys.length > 0) {
					await removeResourceEnvVars(ctx.projectDir, resource.env_keys);
					if (!options.json) {
						tui.info(`Removed ${resource.env_keys.join(', ')} from .env`);
					}
				}

				if (!options.json) {
					tui.success(`Deleted database: ${tui.bold(resource.name)}`);
				}
				return {
					success: true,
					name: resource.name,
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
