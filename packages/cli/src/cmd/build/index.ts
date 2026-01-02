import { z } from 'zod';
import { resolve, join, relative } from 'node:path';
import { createCommand } from '../../types';
import { viteBundle } from './vite-bundler';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { typecheck } from './typecheck';
import { BuildReportCollector, setGlobalCollector, clearGlobalCollector } from '../../build-report';

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
			reportFile: z
				.string()
				.optional()
				.describe('file path to save build report JSON with errors, warnings, and diagnostics'),
		}),
		response: BuildResponseSchema,
	},

	async handler(ctx) {
		const { opts, projectDir, project } = ctx;

		// Initialize build report collector if reportFile is specified
		const collector = new BuildReportCollector();
		if (opts.reportFile) {
			collector.setOutputPath(opts.reportFile);
			collector.enableAutoWrite();
			setGlobalCollector(collector);
		}

		const absoluteProjectDir = resolve(projectDir);
		const outDir = opts.outdir ? resolve(opts.outdir) : join(absoluteProjectDir, '.agentuity');

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
				collector,
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
					const endTypecheckDiagnostic = collector.startDiagnostic('typecheck');
					const typeResult = await typecheck(absoluteProjectDir, { collector });
					endTypecheckDiagnostic();

					if (typeResult.success) {
						tui.success('Type check passed');
					} else {
						console.error('');
						console.error(typeResult.output);
						console.error('');
						const msg =
							'errors' in typeResult ? 'Fix type errors before building' : 'Build error';

						// Write report before fatal exit
						if (opts.reportFile) {
							await collector.forceWrite();
						}
						clearGlobalCollector();
						tui.fatal(msg, ErrorCode.BUILD_FAILED);
					}
				} catch (error: unknown) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					collector.addGeneralError('typescript', errorMsg, 'BUILD004');

					// Write report before fatal exit
					if (opts.reportFile) {
						await collector.forceWrite();
					}
					clearGlobalCollector();

					tui.error(`Type check failed to run: ${errorMsg}`);
					tui.fatal(
						'Unable to run TypeScript type checking. Ensure TypeScript is installed.',
						ErrorCode.BUILD_FAILED
					);
				}
			}

			tui.success('Build complete');

			// Write final report on success
			if (opts.reportFile) {
				await collector.forceWrite();
			}
			clearGlobalCollector();

			return {
				success: true,
				bundlePath: outDir,
				projectName: project?.projectId || 'unknown',
				dev: opts.dev || false,
			};
		} catch (error: unknown) {
			// Add error to collector
			if (error instanceof AggregateError) {
				const ae = error as AggregateError;
				for (const e of ae.errors) {
					collector.addGeneralError('build', e.message, 'BUILD004');
					tui.error(e.message);
				}
			} else {
				collector.addGeneralError('build', String(error), 'BUILD004');
			}

			// Write report before fatal exit
			if (opts.reportFile) {
				await collector.forceWrite();
			}
			clearGlobalCollector();

			if (error instanceof AggregateError) {
				tui.fatal('Build failed', ErrorCode.BUILD_FAILED);
			} else {
				tui.fatal(`Build failed: ${error}`, ErrorCode.BUILD_FAILED);
			}
		}
	},
});
