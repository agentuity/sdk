import { createCommand } from '../../types';
import { z } from 'zod';
import { bundle } from './bundler';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

const BuildResponseSchema = z.object({
	success: z.boolean().describe('Whether the build succeeded'),
	bundlePath: z.string().describe('Path to the build directory'),
	projectName: z.string().describe('Project name'),
	dev: z.boolean().describe('Whether dev mode was enabled'),
	size: z.number().optional().describe('Build size in bytes'),
});

export const command = createCommand({
	name: 'build',
	description: 'Build Agentuity application for deployment',
	tags: ['read-only', 'slow', 'requires-project'],
	aliases: ['bundle'],
	optional: { project: true },
	idempotent: false,
	examples: [getCommand('build'), getCommand('build --dev'), getCommand('bundle')],
	schema: {
		options: z.object({
			dev: z.boolean().optional().describe('Enable development mode'),
		}),
		response: BuildResponseSchema,
	},

	async handler(ctx) {
		const { opts, projectDir, project } = ctx;

		try {
			tui.info(`Bundling project at: ${projectDir}`);

			// Generate agent registry FIRST (so types exist for typecheck)
			tui.info('Generating agent registry...');
			await bundle({
				rootDir: projectDir,
				dev: opts.dev || false,
				project,
				orgId: project?.orgId,
				projectId: project?.projectId,
			});

			// Run TypeScript type checking after registry generation (skip in dev mode)
			if (!opts.dev) {
				try {
					tui.info('Running type check...');
					const { resolve } = await import('node:path');
					const absoluteProjectDir = resolve(projectDir);
					const result = await Bun.$`bunx tsc --noEmit --skipLibCheck`
						.cwd(absoluteProjectDir)
						.nothrow();

					if (result.exitCode === 0) {
						tui.success('Type check passed');
					} else {
						tui.error('Type check failed:\n');
						console.error(result.stderr.toString());
						tui.fatal('Fix type errors before building');
					}
				} catch (error) {
					// If tsc fails to run, show error and fail
					const errorMsg = error instanceof Error ? error.message : String(error);
					tui.error(`Type check failed to run: ${errorMsg}`);
					tui.fatal('Unable to run TypeScript type checking. Ensure TypeScript is installed.');
				}
			}

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
