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
		getCommand('auth ssh delete'),
		getCommand('auth ssh delete <fingerprint>'),
		getCommand('--explain auth ssh delete abc123'),
		getCommand('--dry-run auth ssh delete abc123'),
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
			logger.fatal('API client is not available', ErrorCode.INTERNAL_ERROR);
		}

		const shouldConfirm = process.stdin.isTTY ? opts.confirm : false;

		try {
			let fingerprintsToRemove: string[] = [];

			if (args.fingerprints && args.fingerprints.length > 0) {
				fingerprintsToRemove = args.fingerprints;
			} else {
				const keys = await tui.spinner('Fetching SSH keys...', () => listSSHKeys(apiClient));

				if (keys.length === 0) {
					tui.newline();
					tui.info('No SSH keys found');
					return;
				}

				if (!process.stdin.isTTY) {
					logger.fatal(
						'Interactive selection required but cannot prompt in non-TTY environment. Provide fingerprint as argument.'
					);
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
					tui.newline();
					tui.info('No keys selected');
					return;
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
				return;
			}

			if (shouldConfirm) {
				tui.newline();
				const confirmed = await tui.confirm(
					`Remove ${fingerprintsToRemove.length} SSH key${fingerprintsToRemove.length > 1 ? 's' : ''}?`,
					false
				);

				if (!confirmed) {
					tui.info('Cancelled');
					return;
				}
			}

			// Handle dry-run mode
			if (isDryRunMode(options)) {
				for (const fingerprint of fingerprintsToRemove) {
					outputDryRun(`Would remove SSH key: ${fingerprint}`, options);
				}
				tui.newline();
				tui.info(
					`[DRY RUN] Would remove ${fingerprintsToRemove.length} SSH key${fingerprintsToRemove.length > 1 ? 's' : ''}`
				);
				return;
			}

			// Actually execute the deletion
			for (const fingerprint of fingerprintsToRemove) {
				await tui.spinner(`Removing SSH key ${fingerprint}...`, () =>
					removeSSHKey(apiClient, fingerprint)
				);
			}

			tui.newline();
			tui.success(
				`Removed ${fingerprintsToRemove.length} SSH key${fingerprintsToRemove.length > 1 ? 's' : ''}`
			);

			return {
				success: true,
				removed: fingerprintsToRemove.length,
				fingerprints: fingerprintsToRemove,
			};
		} catch (error) {
			logger.trace(error);
			if (error instanceof Error) {
				logger.fatal(`Failed to remove SSH key: ${error.message}`, ErrorCode.API_ERROR);
			} else {
				logger.fatal('Failed to remove SSH key', ErrorCode.API_ERROR);
			}
		}
	},
});
