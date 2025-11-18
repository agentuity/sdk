import { createSubcommand } from '../../../types';
import { listSSHKeys } from './api';
import * as tui from '../../../tui';
import { z } from 'zod';

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

			// Create aligned table
			const rows = keys.map((key) => [
				key.keyType,
				key.fingerprint,
				key.comment || tui.muted('(no comment)'),
			]);

			// Calculate column widths
			const widths = [
				Math.max(4, ...rows.map((r) => r[0].length)),
				Math.max(11, ...rows.map((r) => r[1].length)),
				Math.max(7, ...rows.map((r) => Bun.stringWidth(r[2]))),
			];

			// Print header
			console.log(
				`${tui.bold('TYPE'.padEnd(widths[0]))}   ${tui.bold('FINGERPRINT'.padEnd(widths[1]))}   ${tui.bold('COMMENT')}`
			);

			// Print rows
			for (const row of rows) {
				console.log(`${row[0].padEnd(widths[0])}   ${row[1].padEnd(widths[1])}   ${row[2]}`);
			}
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
