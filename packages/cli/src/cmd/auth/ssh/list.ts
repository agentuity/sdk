import { createSubcommand } from '../../../types';
import { listSSHKeys } from './api';
import * as tui from '../../../tui';
import { z } from 'zod';
import { Table } from 'console-table-printer';

export const listCommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all SSH keys on your account',
	requires: { apiClient: true, auth: true },
	schema: {
		options: z.object({
			format: z.enum(['text', 'json']).default('text').describe('output format'),
		}),
	},
	async handler(ctx) {
		const { logger, apiClient, opts } = ctx;
		const format = opts.format;

		if (!apiClient) {
			logger.fatal('API client is not available');
		}

		try {
			const keys = await tui.spinner('Fetching SSH keys...', () => listSSHKeys(apiClient));

			if (format === 'json') {
				console.log(JSON.stringify(keys, null, 2));
				return;
			}

			tui.newline();

			if (keys.length === 0) {
				console.log('No SSH keys found');
				return;
			}

			console.log(tui.bold('SSH Keys:'));
			tui.newline();

			const table = new Table({
				columns: [
					{ name: 'TYPE', alignment: 'left' },
					{ name: 'FINGERPRINT', alignment: 'left' },
					{ name: 'COMMENT', alignment: 'left' },
				],
			});

			for (const key of keys) {
				table.addRow({
					TYPE: key.keyType,
					FINGERPRINT: key.fingerprint,
					COMMENT: key.comment || tui.muted('(no comment)'),
				});
			}
			table.printTable();
		} catch (error) {
			logger.trace(error);
			if (error instanceof Error) {
				logger.fatal(`Failed to list SSH keys: ${error.message}`);
			} else {
				logger.fatal('Failed to list SSH keys');
			}
		}
	},
});
