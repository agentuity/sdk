import type { CommandDefinition } from '../../types';
import { Command } from 'commander';
import { logger } from '../../logger';
import pkg from '../../../package.json' with { type: 'json' };

export const versionCommand: CommandDefinition = {
	name: 'version',
	description: 'Display version information',

	register(program: Command) {
		program
			.command('version')
			.description('Display version information')
			.action(async () => {
				try {
					logger.info(pkg.version);
				} catch (error) {
					logger.error('Failed to retrieve version:', error);
					process.exitCode = 1;
				}
			});
	},
};

export default versionCommand;
