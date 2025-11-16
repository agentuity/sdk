import { createSubcommand } from '../../../types';
import { removeSSHKey } from './api';
import * as tui from '../../../tui';
import { z } from 'zod';

const argsSchema = z.tuple([z.string().describe('SSH key fingerprint to remove')]);

export const removeCommand = createSubcommand({
	name: 'ssh-remove',
	description: 'Remove an SSH key from your account',
	requires: { apiClient: true, auth: true },
	schema: {
		args: argsSchema,
	},
	async handler(ctx) {
		const { logger, apiClient, args } = ctx;

		if (!apiClient) {
			logger.fatal('API client is not available');
		}

		const fingerprint = args[0];

		try {
			await tui.spinner('Removing SSH key...', () => removeSSHKey(apiClient, fingerprint));

			tui.newline();
			tui.success('SSH key removed successfully');
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
