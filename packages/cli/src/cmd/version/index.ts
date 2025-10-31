import { createCommand } from '../../types';
import { getVersion } from '../../version';
import { createLogger } from '@agentuity/server';

export const command = createCommand({
	name: 'version',
	description: 'Display version information',

	async handler() {
		try {
			console.log(getVersion());
		} catch (error) {
			const logger = createLogger();
			logger.fatal('Failed to retrieve version: %s', error);
		}
	},
});
