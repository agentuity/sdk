import { z } from 'zod';
import { listResources, deleteResources } from '@agentuity/server';
import enquirer from 'enquirer';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del'],
	description: 'Delete a storage resource',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		getCommand('cloud storage delete my-bucket'),
		getCommand('cloud storage rm my-bucket'),
		getCommand('cloud storage delete'),
		getCommand('--dry-run cloud storage delete my-bucket'),
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Bucket name to delete'),
		}),
		options: z.object({
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether deletion succeeded'),
			name: z.string().describe('Deleted bucket name'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts, config, orgId, region, auth, options } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		let bucketName = args.name;

		if (!bucketName) {
			const resources = await tui.spinner({
				message: `Fetching storage for ${orgId} in ${region}`,
				clearOnSuccess: true,
				callback: async () => {
					return listResources(catalystClient, orgId, region!);
				},
			});

			if (resources.s3.length === 0) {
				tui.info('No storage buckets found to delete');
				return { success: false, name: '' };
			}

			const response = await enquirer.prompt<{ bucket: string }>({
				type: 'select',
				name: 'bucket',
				message: 'Select storage bucket to delete:',
				choices: resources.s3.map((s3) => ({
					name: s3.bucket_name,
					message: s3.bucket_name,
				})),
			});

			bucketName = response.bucket;
		}

		// Handle dry-run mode
		if (isDryRunMode(options)) {
			outputDryRun(`Would delete storage bucket: ${bucketName}`, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Storage bucket deletion skipped');
			}
			return {
				success: false,
				name: bucketName,
			};
		}

		if (!opts.confirm) {
			tui.warning(`You are about to delete storage bucket: ${tui.bold(bucketName)}`);

			const confirm = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: 'Are you sure you want to delete this storage bucket?',
				initial: false,
			});

			if (!confirm.confirm) {
				tui.info('Deletion cancelled');
				return { success: false, name: bucketName };
			}
		}

		const deleted = await tui.spinner({
			message: `Deleting storage bucket ${bucketName}`,
			clearOnSuccess: true,
			callback: async () => {
				return deleteResources(catalystClient, orgId, region!, [
					{ type: 's3', name: bucketName },
				]);
			},
		});

		if (deleted.length > 0) {
			tui.success(`Deleted storage bucket: ${tui.bold(deleted[0])}`);
			return {
				success: true,
				name: deleted[0],
			};
		} else {
			tui.error('Failed to delete storage bucket');
			return { success: false, name: bucketName };
		}
	},
});
