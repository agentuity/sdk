import { z } from 'zod';
import { listResources, projectEnvUpdate } from '@agentuity/server';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createPrompt } from '../../../tui.ts';
import { getCatalystAPIClient } from '../../../config.ts';
import { getCommand } from '../../../command-prefix.ts';
import { isDryRunMode, outputDryRun } from '../../../explain.ts';
import { ErrorCode } from '../../../errors.ts';
import {
	addResourceEnvVars,
	findExistingEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
} from '../../../env-util.ts';

export const databaseSubcommand = createSubcommand({
	name: 'database',
	aliases: ['db'],
	description: 'Link an existing database to the current project',
	tags: ['mutating', 'fast', 'requires-auth', 'requires-project'],
	idempotent: true,
	requires: { auth: true, org: true, region: true, project: true },
	examples: [
		{
			command: getCommand('project add database'),
			description: 'Select a database interactively',
		},
		{
			command: getCommand('project add db my-db'),
			description: 'Link a specific database by name',
		},
		{
			command: getCommand('--dry-run project add database my-db'),
			description: 'Preview linking without making changes',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Database name to link'),
		}),
		options: z.object({}),
		response: z.object({
			success: z.boolean().describe('Whether linking succeeded'),
			name: z.string().describe('Linked database name'),
		}),
	},

	async handler(ctx) {
		const { logger, args, orgId, region, auth, options, projectDir, project } = ctx;

		if (isDryRunMode(options)) {
			const message = args.name
				? `Would link database "${args.name}" to project in ${projectDir}`
				: `Would prompt to select a database to link to project in ${projectDir}`;
			outputDryRun(message, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Database linking skipped');
			}
			return {
				success: false,
				name: args.name || 'dry-run-db',
			};
		}

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		const resources = await tui.spinner({
			message: 'Fetching databases',
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		const availableDatabases = resources.db.filter((db) => !db.internal);

		if (availableDatabases.length === 0) {
			tui.fatal(
				'No databases available. Create one first with: ' +
					tui.bold(getCommand('cloud db create')),
				ErrorCode.RESOURCE_NOT_FOUND
			);
		}

		let selectedDatabase: (typeof availableDatabases)[0] | undefined;

		if (args.name) {
			selectedDatabase = availableDatabases.find((db) => db.name === args.name);
			if (!selectedDatabase) {
				const availableNames = availableDatabases.map((db) => db.name).join(', ');
				tui.fatal(
					`Database "${args.name}" not found. Available databases: ${availableNames}`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}
		} else {
			const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
			if (isHeadless) {
				tui.fatal(
					'Database name is required in non-interactive mode. Usage: ' +
						tui.bold(getCommand('project add database <name>')),
					ErrorCode.MISSING_ARGUMENT
				);
			}

			const prompt = createPrompt();
			const selected = await prompt.select<string>({
				message: 'Select a database to link',
				options: availableDatabases.map((db) => ({
					value: db.name,
					label: `${tui.tuiColors.primary(db.name)}`,
				})),
			});

			// Ensure stdin is paused so process can exit
			if (process.stdin.isTTY) {
				process.stdin.pause();
			}

			if (!selected) {
				tui.fatal('Operation cancelled', ErrorCode.USER_CANCELLED);
			}

			selectedDatabase = availableDatabases.find((db) => db.name === selected);
		}

		if (!selectedDatabase) {
			tui.fatal('Failed to select database', ErrorCode.INTERNAL_ERROR);
		}

		if (selectedDatabase.env && Object.keys(selectedDatabase.env).length > 0) {
			await addResourceEnvVars(projectDir, selectedDatabase.env);
			if (!options.json) {
				tui.success(`Linked database: ${tui.bold(selectedDatabase.name)}`);
				tui.info('Environment variables written to .env');
			}

			// Sync to cloud
			const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
			let shouldSync = true;

			if (!isHeadless && !options.json) {
				shouldSync = await tui.confirm('Sync environment variables to cloud project?', true);
				if (process.stdin.isTTY) {
					process.stdin.pause();
				}
			}

			if (shouldSync) {
				try {
					const envFilePath = await findExistingEnvFile(projectDir);
					const localEnv = await readEnvFile(envFilePath);
					const filteredEnv = filterAgentuitySdkKeys(localEnv);

					if (Object.keys(filteredEnv).length > 0) {
						const { env, secrets } = splitEnvAndSecrets(filteredEnv);
						await tui.spinner({
							message: 'Syncing environment variables to cloud',
							clearOnSuccess: true,
							callback: async () => {
								await projectEnvUpdate(catalystClient, {
									id: project.projectId,
									env,
									secrets,
								});
							},
						});
						if (!options.json) {
							tui.success('Environment variables synced to cloud');
						}
					}
				} catch (error) {
					if (!options.json) {
						tui.warning(
							'Failed to sync environment variables to cloud. You can sync later with: ' +
								tui.bold(getCommand('cloud env push'))
						);
					}
					logger.debug('Failed to sync env to cloud:', error);
				}
			}
		} else {
			if (!options.json) {
				tui.warning(`Database "${selectedDatabase.name}" has no environment variables to add`);
			}
		}

		return {
			success: true,
			name: selectedDatabase.name,
		};
	},
});
