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

export const storageSubcommand = createSubcommand({
	name: 'storage',
	aliases: ['bucket', 's3'],
	description: 'Link an existing storage bucket to the current project',
	tags: ['mutating', 'fast', 'requires-auth', 'requires-project'],
	idempotent: true,
	requires: { auth: true, org: true, region: true, project: true },
	examples: [
		{
			command: getCommand('project add storage'),
			description: 'Select a storage bucket interactively',
		},
		{
			command: getCommand('project add bucket my-bucket'),
			description: 'Link a specific bucket by name',
		},
		{
			command: getCommand('--dry-run project add storage my-bucket'),
			description: 'Preview linking without making changes',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Storage bucket name to link'),
		}),
		options: z.object({}),
		response: z.object({
			success: z.boolean().describe('Whether linking succeeded'),
			name: z.string().describe('Linked bucket name'),
		}),
	},

	async handler(ctx) {
		const { logger, args, orgId, region, auth, options, projectDir, project } = ctx;

		if (isDryRunMode(options)) {
			const message = args.name
				? `Would link storage bucket "${args.name}" to project in ${projectDir}`
				: `Would prompt to select a storage bucket to link to project in ${projectDir}`;
			outputDryRun(message, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Storage linking skipped');
			}
			return {
				success: false,
				name: args.name || 'dry-run-bucket',
			};
		}

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		const resources = await tui.spinner({
			message: 'Fetching storage buckets',
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		const availableBuckets = resources.s3.filter((bucket) => !bucket.internal);

		if (availableBuckets.length === 0) {
			tui.fatal(
				'No storage buckets available. Create one first with: ' +
					tui.bold(getCommand('cloud storage create')),
				ErrorCode.RESOURCE_NOT_FOUND
			);
		}

		let selectedBucket: (typeof availableBuckets)[0] | undefined;

		if (args.name) {
			selectedBucket = availableBuckets.find((bucket) => bucket.bucket_name === args.name);
			if (!selectedBucket) {
				const availableNames = availableBuckets.map((bucket) => bucket.bucket_name).join(', ');
				tui.fatal(
					`Storage bucket "${args.name}" not found. Available buckets: ${availableNames}`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}
		} else {
			const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
			if (isHeadless) {
				tui.fatal(
					'Bucket name is required in non-interactive mode. Usage: ' +
						tui.bold(getCommand('project add storage <name>')),
					ErrorCode.MISSING_ARGUMENT
				);
			}

			const prompt = createPrompt();
			const selected = await prompt.select<string>({
				message: 'Select a storage bucket to link',
				options: availableBuckets.map((bucket) => ({
					value: bucket.bucket_name,
					label: `${tui.tuiColors.primary(bucket.bucket_name)}`,
				})),
			});

			// Ensure stdin is paused so process can exit
			if (process.stdin.isTTY) {
				process.stdin.pause();
			}

			if (!selected) {
				tui.fatal('Operation cancelled', ErrorCode.USER_CANCELLED);
			}

			selectedBucket = availableBuckets.find((bucket) => bucket.bucket_name === selected);
		}

		if (!selectedBucket) {
			tui.fatal('Failed to select storage bucket', ErrorCode.INTERNAL_ERROR);
		}

		if (selectedBucket.env && Object.keys(selectedBucket.env).length > 0) {
			await addResourceEnvVars(projectDir, selectedBucket.env);
			if (!options.json) {
				tui.success(`Linked storage bucket: ${tui.bold(selectedBucket.bucket_name)}`);
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
				tui.warning(
					`Storage bucket "${selectedBucket.bucket_name}" has no environment variables to add`
				);
			}
		}

		return {
			success: true,
			name: selectedBucket.bucket_name,
		};
	},
});
