import { z } from 'zod';
import { resolve, join, relative } from 'node:path';
import { createCommand, DeployOptionsSchema } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { typecheck } from './typecheck';
import { BuildReportCollector, setGlobalCollector, clearGlobalCollector } from '../../build-report';
import { detectVersionMismatch, formatVersionMismatchWarning } from '../../utils/version-mismatch';
import { detectFrameworkWithPackageJson } from './detect';
import { getAdapter } from './adapters';
import { packageBuildOutput } from './package';

const BuildResponseSchema = z.object({
	success: z.boolean().describe('Whether the build succeeded'),
	bundlePath: z.string().describe('Path to the build directory'),
	projectName: z.string().describe('Project name'),
	dev: z.boolean().describe('Whether dev mode was enabled'),
	size: z.number().optional().describe('Build size in bytes'),
	framework: z.string().optional().describe('Detected framework name'),
});

const BuildOptionsSchema = z.intersection(
	DeployOptionsSchema,
	z.object({
		dev: z.boolean().optional().describe('Enable development mode'),
		outdir: z.string().optional().describe('Output directory for build artifacts'),
		skipTypeCheck: z.boolean().default(false).optional().describe('Skip typecheck after build'),
		reportFile: z
			.string()
			.optional()
			.describe('file path to save build report JSON with errors, warnings, and diagnostics'),
		ci: z.boolean().optional().describe('Enable CI build mode'),
		url: z.string().optional().describe('Source code download URL (required with --ci)'),
		directory: z.string().optional().describe('Subdirectory within extracted source'),
	})
);

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
		{
			command: getCommand('build --ci --url https://example.com/source.zip'),
			description: 'Run CI build from source URL',
		},
		{ command: getCommand('bundle'), description: 'Bundle the project' },
	],
	schema: {
		options: BuildOptionsSchema,
		response: BuildResponseSchema,
	},

	async handler(ctx) {
		const { opts, projectDir, project } = ctx;

		if (opts.ci) {
			const { runCIBuild } = await import('./ci');
			await runCIBuild(
				{
					url: opts.url,
					directory: opts.directory,
					trigger: opts.trigger,
					event: opts.event,
					message: opts.message,
					commit: opts.commit,
					commitUrl: opts.commitUrl,
					branch: opts.branch,
					repo: opts.repo,
					provider: opts.provider,
					pullRequestNumber: opts.pullRequestNumber,
					pullRequestUrl: opts.pullRequestUrl,
					logsUrl: opts.logsUrl,
				},
				ctx.logger
			);

			return {
				success: true,
				bundlePath: projectDir,
				projectName: project?.projectId || 'unknown',
				dev: false,
			};
		}

		// Initialize build report collector if reportFile is specified
		const collector = new BuildReportCollector();
		if (opts.reportFile) {
			collector.setOutputPath(opts.reportFile);
			collector.enableAutoWrite();
			setGlobalCollector(collector);
		}

		const absoluteProjectDir = resolve(projectDir);

		// Check for version mismatches (v1 vs v2 SDK packages)
		const versionMismatch = detectVersionMismatch(absoluteProjectDir, ctx.logger);
		if (versionMismatch.hasV1Packages || versionMismatch.hasMajorMismatches) {
			tui.newline();
			tui.warning(formatVersionMismatchWarning(versionMismatch));
			tui.newline();
		}

		const outDir = opts.outdir ? resolve(opts.outdir) : join(absoluteProjectDir, '.agentuity');

		try {
			const rel = outDir.startsWith(absoluteProjectDir)
				? relative(absoluteProjectDir, outDir)
				: outDir;

			// Step 1: Detect framework
			tui.info('Detecting framework...');
			const { framework, packageJson } =
				await detectFrameworkWithPackageJson(absoluteProjectDir);

			if (!framework) {
				collector.addGeneralError(
					'build',
					'Could not detect a JS framework. Ensure package.json exists with a build script.',
					'BUILD010'
				);
				if (opts.reportFile) {
					await collector.forceWrite();
				}
				clearGlobalCollector();
				tui.fatal(
					'Could not detect a JS framework. Ensure package.json exists with a build script.',
					ErrorCode.BUILD_FAILED
				);
			}

			const frameworkLabel = framework.version
				? `${framework.name} v${framework.version}`
				: framework.name;
			tui.success(`Detected ${tui.bold(frameworkLabel)} (${framework.runtime})`);

			// Step 2: Get the build adapter for this framework
			const adapter = getAdapter(framework.name);
			tui.info(`Building with ${adapter.name} adapter to ${rel}`);

			// Step 3: Run the build
			const endBuildDiagnostic = collector.startDiagnostic('build');
			const buildResult = await adapter.build({
				projectDir: absoluteProjectDir,
				framework,
				packageJson: packageJson!,
				outputDir: outDir,
				logger: ctx.logger,
				collector,
				dev: opts.dev,
				projectId: project?.projectId,
				orgId: project?.orgId,
				region: project?.region ?? 'local',
			});
			endBuildDiagnostic();

			// Log build output
			for (const line of buildResult.logs) {
				tui.info(tui.muted(line));
			}

			// Step 4: Package the output with launch metadata
			const packageResult = packageBuildOutput(framework, buildResult, buildResult.outputDir);
			ctx.logger.debug('Launch metadata: %s', JSON.stringify(packageResult.launch, null, 2));

			// Step 5: Copy profile-specific .env file AFTER building
			if (opts.dev && ctx.config?.name) {
				const envSourcePath = join(absoluteProjectDir, `.env.${ctx.config.name}`);
				const envDestPath = join(buildResult.outputDir, '.env');

				const envFile = Bun.file(envSourcePath);
				if (await envFile.exists()) {
					await Bun.write(envDestPath, envFile);
					ctx.logger.debug(`Copied ${envSourcePath} to ${envDestPath}`);
				} else {
					ctx.logger.debug(`No .env.${ctx.config.name} file found, skipping env copy`);
				}
			}

			// Step 6: Run TypeScript type checking (skip in dev mode, skip for non-TS projects)
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

						if (opts.reportFile) {
							await collector.forceWrite();
						}
						clearGlobalCollector();
						tui.fatal(msg, ErrorCode.BUILD_FAILED);
					}
				} catch (error: unknown) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					collector.addGeneralError('typescript', errorMsg, 'BUILD008');

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

			tui.success(`Build complete (${frameworkLabel}, ${buildResult.duration}ms)`);

			// Write final report on success
			if (opts.reportFile) {
				await collector.forceWrite();
			}
			clearGlobalCollector();

			return {
				success: true,
				bundlePath: buildResult.outputDir,
				projectName: project?.projectId || 'unknown',
				dev: opts.dev || false,
				framework: framework.name,
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
