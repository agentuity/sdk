import { APIError, deleteResources, listOrganizations, listOrgResources } from '@agentuity/server';
import enquirer from 'enquirer';
import { z } from 'zod';
import { deleteResourceRegion, getResourceInfo, setResourceInfo } from '../../../cache';
import { getCommand } from '../../../command-prefix';
import { getCatalystAPIClient, getGlobalCatalystAPIClient } from '../../../config';
import { removeResourceEnvVars } from '../../../env-util';
import { ErrorCode } from '../../../errors';
import { isDryRunMode, outputDryRun } from '../../../explain';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';

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
		const catalystClient = await getGlobalCatalystAPIClient(
			logger,
			auth,
			profileName,
			undefined,
			config
		);

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

		// If we have a db name but no orgId, search across all user's orgs
		let resources: Awaited<ReturnType<typeof listOrgResources>> | undefined;
		if (dbName && !orgId) {
			const orgs = await tui.spinner({
				message: 'Searching for database across organizations...',
				clearOnSuccess: true,
				callback: async () => listOrganizations(catalystClient),
			});

			for (const org of orgs) {
				const orgResources = await listOrgResources(catalystClient, {
					type: 'db',
					orgId: org.id,
				});
				// Cache all fetched databases
				for (const db of orgResources.db) {
					await setResourceInfo('db', profileName, db.name, db.cloud_region, org.id);
				}
				const found = orgResources.db.find((db) => db.name === dbName);
				if (found) {
					orgId = org.id;
					resources = orgResources;
					break;
				}
			}

			if (!orgId) {
				tui.fatal(
					`Database '${dbName}' not found in any of your organizations.`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}
		}

		// Fetch databases if we haven't already (when orgId was known upfront)
		if (!resources) {
			resources = await tui.spinner({
				message: `Fetching databases for ${orgId}`,
				clearOnSuccess: true,
				callback: async () => {
					return listOrgResources(catalystClient, { type: 'db', orgId: orgId! });
				},
			});

			// Cache all fetched databases
			for (const db of resources.db) {
				await setResourceInfo('db', profileName, db.name, db.cloud_region, orgId!);
			}
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
			outputDryRun(`Would delete database: ${dbName} (region: ${region})`, options);
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
			const regionalClient = getCatalystAPIClient(logger, auth, region, undefined, config);
			const deleted = await tui.spinner({
				message: `Deleting database ${dbName}`,
				clearOnSuccess: true,
				callback: async () => {
					return deleteResources(regionalClient, orgId!, region, [{ type: 'db', name: dbName }]);
				},
			});

			const resource = deleted[0];
			if (resource) {
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
			}
			tui.error('Failed to delete database');
			return { success: false, name: dbName };
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
