import { deleteResources, listOrgResources } from '@agentuity/server';
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
import { createS3Client } from './utils';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove'],
	description: 'Delete a storage resource, file, or folder',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true },
	optional: { org: true },
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
			command: getCommand('cloud storage delete my-bucket path/to/folder'),
			description: 'Delete a folder and all its contents from a bucket',
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
			count: z.number().optional().describe('Number of files deleted (for folder deletion)'),
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

		let bucketName = args.name;

		// If bucket name provided, try cache first for orgId
		let orgId = ctx.orgId;
		if (bucketName && !orgId) {
			const cachedInfo = await getResourceInfo('bucket', profileName, bucketName);
			orgId = cachedInfo?.orgId;
		}

		// For interactive selection (no bucket name), we need orgId
		if (!bucketName && !orgId) {
			tui.fatal(
				'Organization required for interactive bucket selection. Specify --org-id or provide bucket name.',
				ErrorCode.INVALID_ARGUMENT
			);
		}

		// If we still don't have orgId and have a bucket name, error out
		if (!orgId) {
			tui.fatal(
				`Organization not found for bucket '${bucketName}'. Run 'agentuity cloud storage list' first or specify --org-id.`,
				ErrorCode.INVALID_ARGUMENT
			);
		}

		const resources = await tui.spinner({
			message: `Fetching storage for ${orgId}`,
			clearOnSuccess: true,
			callback: async () => {
				return listOrgResources(catalystClient, { type: 's3', orgId });
			},
		});

		// Cache all fetched buckets
		for (const s3 of resources.s3) {
			if (s3.cloud_region) {
				await setResourceInfo('bucket', profileName, s3.bucket_name, s3.cloud_region, orgId);
			}
		}

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

		// If filename is provided, delete the file or folder from the bucket
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

			const s3Client = createS3Client({
				endpoint: bucket.endpoint,
				access_key: bucket.access_key,
				secret_key: bucket.secret_key,
				region: bucket.region,
			});

			const filePath = args.filename;

			// Check if path represents a folder by listing objects under it
			const folderPrefix = filePath.endsWith('/') ? filePath : filePath + '/';
			const folderContents: Array<{ key: string }> = [];
			let continuationToken: string | undefined;
			let isTruncated = false;

			do {
				const folderResult = await s3Client.list({
					prefix: folderPrefix,
					...(continuationToken ? { continuationToken } : {}),
				});
				if (folderResult.contents) {
					folderContents.push(...folderResult.contents);
				}
				continuationToken = folderResult.nextContinuationToken;
				isTruncated = folderResult.isTruncated ?? false;
			} while (isTruncated);

			if (folderContents.length > 0) {
				// Path is a folder — recursive delete
				const keysToDelete = folderContents.map((obj: { key: string }) => obj.key);

				// Handle dry-run mode
				if (isDryRunMode(options)) {
					outputDryRun(
						`Would delete ${keysToDelete.length} file${keysToDelete.length === 1 ? '' : 's'} under ${folderPrefix} from bucket ${bucketName}`,
						options
					);
					if (!options.json) {
						tui.newline();
						tui.info('[DRY RUN] Folder deletion skipped');
					}
					return { success: false, name: filePath, count: keysToDelete.length };
				}

				// Confirm
				if (!opts.confirm) {
					tui.warning(
						`You are about to delete ${tui.bold(String(keysToDelete.length))} file${keysToDelete.length === 1 ? '' : 's'} under folder: ${tui.bold(folderPrefix)} from bucket: ${tui.bold(bucketName)}`
					);
					const confirm = await enquirer.prompt<{ confirm: boolean }>({
						type: 'confirm',
						name: 'confirm',
						message: 'Are you sure you want to delete this folder and all its contents?',
						initial: false,
					});
					if (!confirm.confirm) {
						tui.info('Deletion cancelled');
						return { success: false, name: filePath };
					}
				}

				// Delete all files
				await tui.spinner({
					message: `Deleting ${keysToDelete.length} file${keysToDelete.length === 1 ? '' : 's'} under ${folderPrefix} from ${bucketName}`,
					clearOnSuccess: true,
					callback: async () => {
						const errors: Array<{ key: string; error: string }> = [];
						for (const key of keysToDelete) {
							try {
								await s3Client.delete(key);
							} catch (err) {
								errors.push({
									key,
									error: err instanceof Error ? err.message : String(err),
								});
							}
						}
						if (errors.length > 0) {
							const failedKeys = errors.map((e) => e.key).join(', ');
							throw new Error(
								`Failed to delete ${errors.length} file${errors.length === 1 ? '' : 's'}: ${failedKeys}`
							);
						}
					},
				});

				// Also delete the exact file if it exists (handles file+folder name conflicts)
				// Skip if filePath was already deleted as part of folder contents (e.g., trailing-slash folder markers)
				if (!keysToDelete.includes(filePath)) {
					const exactFileCheck = await s3Client.list({ prefix: filePath });
					const exactFile = (exactFileCheck.contents || []).find(
						(obj: { key: string }) => obj.key === filePath
					);
					if (exactFile) {
						await s3Client.delete(filePath);
						keysToDelete.push(filePath);
					}
				}

				if (!options.json) {
					tui.success(
						`Deleted ${tui.bold(String(keysToDelete.length))} file${keysToDelete.length === 1 ? '' : 's'} under ${tui.bold(folderPrefix)} from ${tui.bold(bucketName)}`
					);
				}

				return { success: true, name: filePath, count: keysToDelete.length };
			}

			// Not a folder — check if exact file exists
			const fileResult = await s3Client.list({ prefix: filePath });
			const exactMatch = (fileResult.contents || []).find(
				(obj: { key: string }) => obj.key === filePath
			);

			if (!exactMatch) {
				tui.fatal(
					`No file or folder found at '${filePath}' in bucket '${bucketName}'`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}

			// Handle dry-run mode
			if (isDryRunMode(options)) {
				outputDryRun(`Would delete file ${filePath} from bucket ${bucketName}`, options);
				if (!options.json) {
					tui.newline();
					tui.info('[DRY RUN] File deletion skipped');
				}
				return {
					success: false,
					name: filePath,
				};
			}

			if (!opts.confirm) {
				tui.warning(
					`You are about to delete file: ${tui.bold(filePath)} from bucket: ${tui.bold(bucketName)}`
				);

				const confirm = await enquirer.prompt<{ confirm: boolean }>({
					type: 'confirm',
					name: 'confirm',
					message: 'Are you sure you want to delete this file?',
					initial: false,
				});

				if (!confirm.confirm) {
					tui.info('Deletion cancelled');
					return { success: false, name: filePath };
				}
			}

			await tui.spinner({
				message: `Deleting ${filePath} from ${bucketName}`,
				clearOnSuccess: true,
				callback: async () => {
					await s3Client.delete(filePath);
				},
			});

			if (!options.json) {
				tui.success(`Deleted file: ${tui.bold(filePath)} from ${tui.bold(bucketName)}`);
			}

			return {
				success: true,
				name: filePath,
			};
		}

		// Otherwise, delete the bucket
		// Find the bucket to get its region
		const bucketToDelete = resources.s3.find((s3) => s3.bucket_name === bucketName);
		if (!bucketToDelete) {
			tui.fatal(`Storage bucket '${bucketName}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}
		if (!bucketToDelete.cloud_region) {
			tui.fatal(
				`Storage bucket '${bucketName}' is missing region information`,
				ErrorCode.RESOURCE_NOT_FOUND
			);
		}
		const region = bucketToDelete.cloud_region;

		// Handle dry-run mode
		if (isDryRunMode(options)) {
			outputDryRun(`Would delete storage bucket: ${bucketName} (region: ${region})`, options);
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

		// Use regional client for the delete operation
		const regionalClient = getCatalystAPIClient(logger, auth, region, undefined, config);
		const deleted = await tui.spinner({
			message: `Deleting storage bucket ${bucketName}`,
			clearOnSuccess: true,
			callback: async () => {
				return deleteResources(regionalClient, orgId, region, [
					{ type: 's3', name: bucketName },
				]);
			},
		});

		const resource = deleted[0];
		if (resource) {
			// Clear cache entry for deleted bucket
			await deleteResourceRegion('bucket', profileName, resource.name);

			// Remove env vars from .env if running inside a project
			if (ctx.projectDir && resource.env_keys.length > 0) {
				await removeResourceEnvVars(ctx.projectDir, resource.env_keys);
				if (!options.json) {
					tui.info(`Removed ${resource.env_keys.join(', ')} from .env`);
				}
			}

			if (!options.json) {
				tui.success(`Deleted storage bucket: ${tui.bold(resource.name)}`);
			}
			return {
				success: true,
				name: resource.name,
			};
		}
		tui.error('Failed to delete storage bucket');
		return { success: false, name: bucketName };
	},
});
