import { createCommand } from '../../types';
import { z } from 'zod';
import { bundle } from './bundler';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

const BundleResponseSchema = z.object({
	success: z.boolean().describe('Whether the bundle succeeded'),
	bundlePath: z.string().describe('Path to the bundle directory'),
	projectName: z.string().describe('Project name'),
	dev: z.boolean().describe('Whether dev mode was enabled'),
	size: z.number().optional().describe('Bundle size in bytes'),
});

export const command = createCommand({
	name: 'bundle',
	description: 'Bundle Agentuity application for deployment',
	tags: ['read-only', 'slow', 'requires-project'],
	aliases: ['build'],
	optional: { project: true },
	idempotent: false,
	examples: [getCommand('bundle'), getCommand('bundle --dev'), getCommand('build')],
	schema: {
		options: z.object({
			dev: z.boolean().optional().describe('Enable development mode'),
		}),
		response: BundleResponseSchema,
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

			return {
				success: true,
				bundlePath: `${projectDir}/.agentuity`,
				projectName: project?.projectId || 'unknown',
				dev: opts.dev || false,
			};
		} catch (error) {
			if (error instanceof Error) {
				tui.fatal(`Bundle failed: ${error.message}`);
			} else {
				tui.fatal('Bundle failed');
			}
		}
	},
});
