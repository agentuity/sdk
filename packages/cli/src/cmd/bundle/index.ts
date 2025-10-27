import { createSubcommand } from '@/types';
import { z } from 'zod';
import { resolve } from 'node:path';
import { bundle } from './bundler';

export const command = createSubcommand({
	name: 'bundle',
	description: 'Bundle Agentuity application for deployment',
	aliases: ['build'],
	schema: {
		options: z.object({
			dir: z.string().optional().describe('Root directory of the project'),
			dev: z.boolean().optional().describe('Enable development mode'),
		}),
	},

	async handler(ctx) {
		const { logger, opts } = ctx;
		const rootDir = resolve(opts.dir || process.cwd());

		try {
			logger.info(`Bundling project at: ${rootDir}`);

			await bundle({
				rootDir,
				dev: opts.dev || false,
			});

			logger.info('✓ Bundle complete');
		} catch (error) {
			if (error instanceof Error) {
				logger.fatal(`Bundle failed: ${error.message}`);
			} else {
				logger.fatal('Bundle failed');
			}
		}
	},
});
