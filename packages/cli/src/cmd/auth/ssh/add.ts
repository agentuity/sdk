import { createSubcommand } from '../../../types';
import { addSSHKey, computeSSHKeyFingerprint } from './api';
import * as tui from '../../../tui';
import { readFileSync } from 'fs';
import { z } from 'zod';

const optionsSchema = z.object({
	file: z.string().optional().describe('File containing the public key'),
});

export const addCommand = createSubcommand({
	name: 'ssh-add',
	description: 'Add an SSH public key to your account (reads from file or stdin)',
	requires: { apiClient: true, auth: true },
	schema: {
		options: optionsSchema,
	},
	async handler(ctx) {
		const { logger, apiClient, opts } = ctx;

		if (!apiClient) {
			logger.fatal('API client is not available');
		}

		try {
			let publicKey: string = '';

			if (opts.file) {
				// Read from file
				try {
					publicKey = readFileSync(opts.file, 'utf-8').trim();
				} catch (error) {
					logger.fatal(
						`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			} else {
				// Read from stdin
				const stdin = await Bun.stdin.text();
				publicKey = stdin.trim();
			}

			if (!publicKey) {
				logger.fatal('No public key provided');
			}

			// Validate key format
			try {
				computeSSHKeyFingerprint(publicKey);
			} catch (error) {
				logger.fatal(
					`Invalid SSH key format: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}

			const result = await tui.spinner('Adding SSH key...', () =>
				addSSHKey(apiClient, publicKey)
			);

			tui.newline();
			tui.success('SSH key added successfully');
			console.log(`Fingerprint: ${tui.muted(result.fingerprint)}`);
		} catch (error) {
			logger.trace(error);
			if (error instanceof Error) {
				logger.fatal(`Failed to add SSH key: ${error.message}`);
			} else {
				logger.fatal('Failed to add SSH key');
			}
		}
	},
});
