import { createSubcommand } from '../../../types';
import { removeSSHKey, listSSHKeys } from './api';
import * as tui from '../../../tui';
import enquirer from 'enquirer';
import { z } from 'zod';
import { isExplainMode, isDryRunMode, outputExplain, outputDryRun } from '../../../explain';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const SSHDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	removed: z.number().describe('Number of keys removed'),
	fingerprints: z.array(z.string()).describe('Fingerprints of removed keys'),
});

export const deleteCommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove'],
	description: 'Delete an SSH key from your account',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { apiClient: true, auth: true },
	idempotent: false,
	examples: [
		{ command: getCommand('auth ssh delete'), description: 'Delete item' },
		{ command: getCommand('auth ssh delete <fingerprint>'), description: 'Delete item' },
		{ command: getCommand('--explain auth ssh delete abc123'), description: 'Delete item' },
		{ command: getCommand('--dry-run auth ssh delete abc123'), description: 'Delete item' },
	],
	schema: {
		args: z.object({
			fingerprints: z.array(z.string()).optional().describe('SSH key fingerprint(s) to remove'),
		}),
		options: z.object({
			confirm: z.boolean().default(true).describe('prompt for confirmation before deletion'),
		}),
		response: SSHDeleteResponseSchema,
	},
	async handler(ctx) {
		const { logger, apiClient, args, opts, options } = ctx;

		if (!apiClient) {
			return logger.fatal('API client is not available', ErrorCode.INTERNAL_ERROR) as never;
		}

		const shouldConfirm = process.stdin.isTTY ? opts.confirm : false;

		try {
			let fingerprintsToRemove: string[] = [];

			if (args.fingerprints && args.fingerprints.length > 0) {
				fingerprintsToRemove = args.fingerprints;
			} else {
				const keys = await tui.spinner('Fetching SSH keys...', () => listSSHKeys(apiClient));

				if (keys.length === 0) {
					if (!options.json) {
						tui.newline();
						tui.info('No SSH keys found');
					}
					return { success: false, removed: 0, fingerprints: [] };
				}

				if (!process.stdin.isTTY) {
					return logger.fatal(
						'Interactive selection required but cannot prompt in non-TTY environment. Provide fingerprint as argument.'
					) as never;
				}

				tui.newline();

				const response = await enquirer.prompt<{ keys: string[] }>({
					type: 'multiselect',
					name: 'keys',
					message: 'Select SSH keys to remove (Space to select, Enter to confirm)',
					choices: keys.map((key) => ({
						name: key.fingerprint,
						message: `${key.keyType.padEnd(12)} ${key.fingerprint} ${tui.muted(key.comment || '(no comment)')}`,
					})),
				});

				fingerprintsToRemove = response.keys;

				if (fingerprintsToRemove.length === 0) {
					if (!options.json) {
						tui.newline();
						tui.info('No keys selected');
					}
					return { success: false, removed: 0, fingerprints: [] };
				}
			}

			// If in explain mode, show what would happen
			if (isExplainMode(options)) {
				outputExplain(
					{
						command: 'auth ssh delete',
						description: 'Delete SSH keys from your account',
						steps: fingerprintsToRemove.map((fp) => ({
							action: `Remove SSH key with fingerprint: ${fp}`,
						})),
						warnings: ['This action cannot be undone'],
					},
					options
				);
				return { success: false, removed: 0, fingerprints: [] };
			}

			if (shouldConfirm) {
				tui.newline();
				const confirmed = await tui.confirm(
					`Remove ${fingerprintsToRemove.length} SSH key${fingerprintsToRemove.length > 1 ? 's' : ''}?`,
					false
				);

				if (!confirmed) {
					if (!options.json) {
						tui.info('Cancelled');
					}
					return { success: false, removed: 0, fingerprints: [] };
				}
			}

			// Handle dry-run mode
			if (isDryRunMode(options)) {
				for (const fingerprint of fingerprintsToRemove) {
					outputDryRun(`Would remove SSH key: ${fingerprint}`, options);
				}
				if (!options.json) {
					tui.newline();
					tui.info(
						`[DRY RUN] Would remove ${fingerprintsToRemove.length} SSH key${fingerprintsToRemove.length > 1 ? 's' : ''}`
					);
				}
				return { success: false, removed: 0, fingerprints: [] };
			}

			// Actually execute the deletion
			for (const fingerprint of fingerprintsToRemove) {
				await tui.spinner(`Removing SSH key ${fingerprint}...`, () =>
					removeSSHKey(apiClient, fingerprint)
				);
			}

			if (!options.json) {
				tui.newline();
				tui.success(
					`Removed ${fingerprintsToRemove.length} SSH key${fingerprintsToRemove.length > 1 ? 's' : ''}`
				);
			}

			return {
				success: true,
				removed: fingerprintsToRemove.length,
				fingerprints: fingerprintsToRemove,
			};
		} catch (error) {
			logger.trace(error);
			if (error instanceof Error) {
				return logger.fatal(
					`Failed to remove SSH key: ${error.message}`,
					ErrorCode.API_ERROR
				) as never;
			} else {
				return logger.fatal('Failed to remove SSH key', ErrorCode.API_ERROR) as never;
			}
		}
	},
});
