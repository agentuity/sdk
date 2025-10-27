import type { CommandDefinition, CommandContext } from '../../types';
import { Command } from 'commander';
import { resolve } from 'node:path';
import { bundle } from './bundler';

interface BundleOptions {
	dir: string;
	dev?: boolean;
}

export const bundleCommand: CommandDefinition = {
	name: 'bundle',
	description: 'Bundle Agentuity application for deployment',

	register(program: Command, ctx: CommandContext) {
		program
			.command('bundle')
			.alias('build')
			.description('Bundle Agentuity application for deployment')
			.option('-d, --dir <path>', 'Root directory of the project', process.cwd())
			.option('--dev', 'Enable development mode', false)
			.action(async (options: BundleOptions) => {
				const { logger } = ctx;

				const rootDir = resolve(options.dir);

				try {
					logger.info(`Bundling project at: ${rootDir}`);

					if (options.dev) {
						logger.info('🧑🏻‍💻 Development mode enabled');
					}

					await bundle({
						rootDir,
						dev: options.dev ?? false,
					});

					logger.info('Bundle completed successfully');
				} catch (error) {
					logger.error('Bundle failed:', error);
					process.exit(1);
				}
			});
	},
};

export default bundleCommand;
