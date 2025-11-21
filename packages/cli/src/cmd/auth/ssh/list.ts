import { createSubcommand } from '../../../types';
import { listSSHKeys } from './api';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { z } from 'zod';

const SSHListResponseSchema = z.array(
	z.object({
		id: z.string().describe('SSH key ID'),
		fingerprint: z.string().describe('SSH key fingerprint'),
		keyType: z.string().describe('SSH key type (e.g., ssh-rsa, ssh-ed25519)'),
		comment: z.string().optional().describe('SSH key comment'),
		createdAt: z.string().optional().describe('Creation timestamp'),
	})
);

export const listCommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all SSH keys on your account',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { apiClient: true, auth: true },
	idempotent: true,
	examples: [
		getCommand('auth ssh list'),
		getCommand('auth ssh ls'),
		getCommand('--json auth ssh list'),
	],
	schema: {
		response: SSHListResponseSchema,
	},
	async handler(ctx) {
		const { logger, apiClient, options } = ctx;

		if (!apiClient) {
			logger.fatal('API client is not available', ErrorCode.INTERNAL_ERROR);
		}

		try {
			const keys = await tui.spinner('Fetching SSH keys...', () => listSSHKeys(apiClient));

			if (options.json) {
				console.log(JSON.stringify(keys, null, 2));
				return keys;
			}

			tui.newline();

			if (keys.length === 0) {
				console.log('No SSH keys found');
				return [];
			}

			console.log(tui.bold('SSH Keys:'));
			tui.newline();

			const tableData = keys.map((key) => ({
				TYPE: key.keyType,
				FINGERPRINT: key.fingerprint,
				COMMENT: key.comment || tui.muted('(no comment)'),
			}));

			tui.table(tableData, [
				{ name: 'TYPE', alignment: 'left' },
				{ name: 'FINGERPRINT', alignment: 'left' },
				{ name: 'COMMENT', alignment: 'left' },
			]);

			return keys;
		} catch (error) {
			logger.trace(error);
			if (error instanceof Error) {
				logger.fatal(`Failed to list SSH keys: ${error.message}`, ErrorCode.API_ERROR);
			} else {
				logger.fatal('Failed to list SSH keys', ErrorCode.API_ERROR);
			}
		}
	},
});
