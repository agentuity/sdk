import { createCommand } from '../../types';
import { getVersion } from '../../version';
import { createLogger } from '@agentuity/server';
import { getCommand } from '../../command-prefix';
import { z } from 'zod';
import { ErrorCode } from '../../errors';

const VersionResponseSchema = z.string().describe('CLI version number');

export const command = createCommand({
	name: 'version',
	description: 'Display version information',
	tags: ['read-only', 'fast'],
	examples: [getCommand('version'), getCommand('--version')],
	schema: {
		response: VersionResponseSchema,
	},
	idempotent: true,

	async handler() {
		try {
			const version = getVersion();
			console.log(version);
			return version;
		} catch (error) {
			const logger = createLogger();
			logger.fatal('Failed to retrieve version: %s', error, ErrorCode.INTERNAL_ERROR);
		}
	},
});
