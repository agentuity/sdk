import { createCommand } from '../../types';
import { z } from 'zod';
import { bundle } from './bundler';

export const command = createCommand({
	name: 'bundle',
	description: 'Bundle Agentuity application for deployment',
	aliases: ['build'],
	optional: { project: true },
	schema: {
		options: z.object({
			dev: z.boolean().optional().describe('Enable development mode'),
		}),
	},

	async handler(ctx) {
		const { logger, opts, projectDir, project } = ctx;

		try {
			logger.info(`Bundling project at: ${projectDir}`);

			await bundle({
				rootDir: projectDir,
				dev: opts.dev || false,
				project,
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
