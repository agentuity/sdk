import { createSubcommand } from '../../types';

export const versionSubcommand = createSubcommand({
	name: 'version',
	description: 'Example: Display version information (no auth required)',

	async handler(ctx) {
		const { logger } = ctx;

		logger.info('Version 1.0.0');
		logger.info('This command does not require authentication');
	},
});
