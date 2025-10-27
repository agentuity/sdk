import { createCommand } from '@/types';
import { getVersion } from '@/version';
import { logger } from '@/logger';

export const command = createCommand({
	name: 'version',
	description: 'Display version information',

	async handler() {
		try {
			console.log(getVersion());
		} catch (error) {
			logger.fatal('Failed to retrieve version: %s', error);
		}
	},
});
