import { createCommand } from '../../types';
import { z } from 'zod';
import { bundle } from './bundler';
import * as tui from '../../tui';

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
		const { opts, projectDir, project } = ctx;

		try {
			tui.info(`Bundling project at: ${projectDir}`);

			await bundle({
				rootDir: projectDir,
				dev: opts.dev || false,
				project,
			});

			tui.success('Bundle complete');
		} catch (error) {
			if (error instanceof Error) {
				tui.fatal(`Bundle failed: ${error.message}`);
			} else {
				tui.fatal('Bundle failed');
			}
		}
	},
});
