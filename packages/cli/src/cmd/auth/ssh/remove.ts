import { createSubcommand } from '../../../types';
import { removeSSHKey, listSSHKeys } from './api';
import * as tui from '../../../tui';
import enquirer from 'enquirer';
import { z } from 'zod';

export const removeCommand = createSubcommand({
	name: 'ssh-remove',
	description: 'Remove one or more SSH keys from your account',
	requires: { apiClient: true, auth: true },
	schema: {
		args: z.object({
			fingerprints: z.array(z.string()).optional().describe('SSH key fingerprint(s) to remove'),
		}),
		options: z.object({
			confirm: z.boolean().default(true).describe('prompt for confirmation before deletion'),
		}),
	},
	async handler(ctx) {
		const { logger, apiClient, args, opts } = ctx;

		if (!apiClient) {
			logger.fatal('API client is not available');
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

			for (const fingerprint of fingerprintsToRemove) {
				await tui.spinner(`Removing SSH key ${fingerprint}...`, () =>
					removeSSHKey(apiClient, fingerprint)
				);
			}

			tui.newline();
			tui.success(
				`Removed ${fingerprintsToRemove.length} SSH key${fingerprintsToRemove.length > 1 ? 's' : ''}`
			);
		} catch (error) {
			logger.trace(error);
			if (error instanceof Error) {
				logger.fatal(`Failed to remove SSH key: ${error.message}`);
			} else {
				logger.fatal('Failed to remove SSH key');
			}
		}
	},
});
