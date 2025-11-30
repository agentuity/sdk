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
	examples: [
		{ command: getCommand('version'), description: 'Show the CLI semantic version' },
		{
			command: getCommand('--version'),
			description: 'Display the current installed CLI version and build metadata',
		},
	],
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
			return logger.fatal(
				'Failed to retrieve version: %s',
				error,
				ErrorCode.INTERNAL_ERROR
			) as never;
		}
	},
});
