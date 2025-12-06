import { z } from 'zod';
import { listResources, deleteResources } from '@agentuity/server';
import enquirer from 'enquirer';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import { ErrorCode } from '../../../errors';
import { createS3Client } from './utils';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove'],
	description: 'Delete a storage resource or file',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		{
			command: getCommand('cloud storage delete my-bucket'),
			description: 'Delete a storage bucket',
		},
		{
			command: getCommand('cloud storage rm my-bucket file.txt'),
			description: 'Delete a file from a bucket',
		},
		{
			command: getCommand('cloud storage delete'),
			description: 'Interactive selection to delete a bucket',
		},
		{
			command: getCommand('--dry-run cloud storage delete my-bucket'),
			description: 'Dry-run: show what would be deleted without making changes',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Bucket name'),
			filename: z.string().optional().describe('File path to delete from bucket'),
		}),
		options: z.object({
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether deletion succeeded'),
			name: z.string().describe('Deleted bucket or file name'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts, orgId, region, auth, options } = ctx;

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		const resources = await tui.spinner({
			message: `Fetching storage for ${orgId} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region!);
			},
		});

		let bucketName = args.name;

		if (!bucketName) {
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

		// If filename is provided, delete the file from the bucket
		if (args.filename) {
			const bucket = resources.s3.find((s3) => s3.bucket_name === bucketName);

			if (!bucket) {
				tui.fatal(`Storage bucket '${bucketName}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}

			if (!bucket.access_key || !bucket.secret_key || !bucket.endpoint) {
				tui.fatal(
					`Storage bucket '${bucketName}' is missing credentials`,
					ErrorCode.CONFIG_INVALID
				);
			}

			// Handle dry-run mode
			if (isDryRunMode(options)) {
				outputDryRun(`Would delete file ${args.filename} from bucket ${bucketName}`, options);
				if (!options.json) {
					tui.newline();
					tui.info('[DRY RUN] File deletion skipped');
				}
				return {
					success: false,
					name: args.filename,
				};
			}

			if (!opts.confirm) {
				tui.warning(
					`You are about to delete file: ${tui.bold(args.filename)} from bucket: ${tui.bold(bucketName)}`
				);

				const confirm = await enquirer.prompt<{ confirm: boolean }>({
					type: 'confirm',
					name: 'confirm',
					message: 'Are you sure you want to delete this file?',
					initial: false,
				});

				if (!confirm.confirm) {
					tui.info('Deletion cancelled');
					return { success: false, name: args.filename };
				}
			}

			const s3Client = createS3Client({
				endpoint: bucket.endpoint,
				access_key: bucket.access_key,
				secret_key: bucket.secret_key,
				region: bucket.region,
			});

			await tui.spinner({
				message: `Deleting ${args.filename} from ${bucketName}`,
				clearOnSuccess: true,
				callback: async () => {
					await s3Client.delete(args.filename!);
				},
			});

			if (!options.json) {
				tui.success(`Deleted file: ${tui.bold(args.filename)} from ${tui.bold(bucketName)}`);
			}

			return {
				success: true,
				name: args.filename,
			};
		}

		// Otherwise, delete the bucket
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
