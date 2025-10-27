import type { SubcommandDefinition } from '@/types';
import { getProfile } from '@/config';
import { readFile } from 'node:fs/promises';
import * as tui from '@/tui';

export const showCommand: SubcommandDefinition = {
	name: 'show',
	description: 'Show the configuration of the current profile',
	aliases: ['current'],

	async handler(ctx) {
		const { logger } = ctx;

		try {
			const profilePath = await getProfile();
			const content = await readFile(profilePath, 'utf-8');

			tui.info(`Current profile: ${profilePath}`);
			tui.newline();

			console.log(content);
		} catch (error) {
			if (error instanceof Error) {
				logger.fatal(`Failed to show profile: ${error.message}`);
			} else {
				logger.fatal('Failed to show profile');
			}
		}
	},
};
