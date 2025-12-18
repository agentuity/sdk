import { z } from 'zod';
import { resolve, join, relative } from 'node:path';
import { createCommand } from '../../types';
import { viteBundle } from './vite-bundler';
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
	examples: [
		{ command: getCommand('build'), description: 'Build the project' },
		{ command: getCommand('build --dev'), description: 'Run in development mode' },
		{ command: getCommand('bundle'), description: 'Bundle the project' },
	],
	schema: {
		options: z.object({
			dev: z.boolean().optional().describe('Enable development mode'),
			outdir: z.string().optional().describe('Output directory for build artifacts'),
			skipTypeCheck: z
				.boolean()
				.default(false)
				.optional()
				.describe('Skip typecheck after build'),
		}),
		response: BuildResponseSchema,
	},

	async handler(ctx) {
		const { opts, projectDir, project } = ctx;

		const absoluteProjectDir = resolve(projectDir);
		const outDir = opts.outdir ? resolve(opts.outdir) : join(absoluteProjectDir, '.agentuity');

		// Set NODE_ENV based on --dev flag to prevent build-time inlining issues
		// Production builds should have NODE_ENV=production, dev builds use development
		process.env.NODE_ENV = opts.dev ? 'development' : 'production';

		try {
			const rel = outDir.startsWith(absoluteProjectDir)
				? relative(absoluteProjectDir, outDir)
				: outDir;
			tui.info(`Building project with Vite at ${absoluteProjectDir} to ${rel}`);

			await viteBundle({
				rootDir: absoluteProjectDir,
				dev: opts.dev || false,
				projectId: project?.projectId,
				orgId: project?.orgId,
				region: project?.region ?? 'local',
				logger: ctx.logger,
			});

			// Copy profile-specific .env file AFTER bundling (bundler clears outDir first)
			if (opts.dev && ctx.config?.name) {
				const envSourcePath = join(absoluteProjectDir, `.env.${ctx.config.name}`);
				const envDestPath = join(outDir, '.env');

				const envFile = Bun.file(envSourcePath);
				if (await envFile.exists()) {
					await Bun.write(envDestPath, envFile);
					ctx.logger.debug(`Copied ${envSourcePath} to ${envDestPath}`);
				} else {
					ctx.logger.debug(`No .env.${ctx.config.name} file found, skipping env copy`);
				}
			}

			// Run TypeScript type checking after registry generation (skip in dev mode)
			if (!opts.dev && !opts.skipTypeCheck) {
				try {
					tui.info('Running type check...');
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
				} catch (error: unknown) {
					// If tsc fails to run, show error and fail
					const errorMsg = error instanceof Error ? error.message : String(error);
					tui.error(`Type check failed to run: ${errorMsg}`);
					tui.fatal('Unable to run TypeScript type checking. Ensure TypeScript is installed.');
				}
			}

			tui.success('Build complete');

			return {
				success: true,
				bundlePath: outDir,
				projectName: project?.projectId || 'unknown',
				dev: opts.dev || false,
			};
		} catch (error: unknown) {
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
