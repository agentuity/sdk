import { z } from 'zod';
import { resolve } from 'node:path';
import { createCommand } from '../../types';
import { bundle } from './bundler';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

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

		const absoluteProjectDir = resolve(projectDir);

		try {
			tui.info(`Bundling project at: ${absoluteProjectDir}`);

			// Generate agent registry FIRST (so types exist for typecheck)
			tui.info('Generating agent registry...');
			await bundle({
				rootDir: absoluteProjectDir,
				dev: opts.dev || false,
				project,
				orgId: project?.orgId,
				projectId: project?.projectId,
			});

			// Run TypeScript type checking after registry generation (skip in dev mode)
			if (!opts.dev) {
				try {
					tui.info('Running type check...');
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
				bundlePath: `${absoluteProjectDir}/.agentuity`,
				projectName: project?.projectId || 'unknown',
				dev: opts.dev || false,
			};
		} catch (error) {
			if (error instanceof AggregateError) {
				const ae = error as AggregateError;
				for (const e of ae.errors) {
					tui.error(e.message);
				}
				tui.fatal('Build failed', ErrorCode.BUILD_FAILED);
			} else {
				tui.fatal(`Build failed: ${error}`, ErrorCode.BUILD_FAILED);
			}
		}
	},
});
