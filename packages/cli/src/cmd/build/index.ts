import { copyFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';
import { pathExists } from '../../node-compat/fs.ts';
import * as tui from '../../tui.ts';
import { createCommand, DeployOptionsSchema } from '../../types.ts';
import {
	BuildReportCollector,
	setGlobalCollector,
	clearGlobalCollector,
} from '../../build-report.ts';
import { FrameworkDetectionError, TypecheckError, runBuildPipeline } from './run.ts';

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
		url: z.string().optional().describe('Source code download URL for CI builds'),
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
			const { runCIBuild } = await import('./ci.ts');
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
					skipDnsValidation: opts.skipDnsValidation ?? true,
					skipTypeCheck: opts.skipTypeCheck,
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

		try {
			tui.info('Detecting framework...');
			const pipelineResult = await runBuildPipeline({
				projectDir: absoluteProjectDir,
				logger: ctx.logger,
				collector,
				outputDir: opts.outdir ? resolve(opts.outdir) : undefined,
				skipTypeCheck: opts.skipTypeCheck,
				dev: opts.dev,
				projectId: project?.projectId,
				orgId: project?.orgId,
				region: project?.region ?? 'local',
			});

			const { framework, monorepo, buildResult, packageResult, outputDir } = pipelineResult;

			const frameworkLabel = framework.version
				? `${framework.name} v${framework.version}`
				: framework.name;
			tui.success(`Detected ${tui.bold(frameworkLabel)} (${framework.runtime})`);
			for (const warning of framework.warnings ?? []) {
				tui.warning(warning);
			}
			if (monorepo) {
				tui.info(
					`Detected ${tui.bold(monorepo.packageManager)} workspace at ${tui.muted(monorepo.root)} (subpackage: ${tui.bold(monorepo.subpath)})`
				);
			}

			const rel = outputDir.startsWith(absoluteProjectDir)
				? relative(absoluteProjectDir, outputDir)
				: outputDir;
			tui.info(`Built to ${rel}`);
			for (const line of pipelineResult.logs) {
				tui.info(tui.muted(line));
			}
			ctx.logger.debug('Launch metadata: %s', JSON.stringify(packageResult.launch, null, 2));

			// Copy profile-specific .env file AFTER building, before returning
			// success. The shared pipeline doesn't know about CLI profiles, so
			// this stays here.
			if (opts.dev && ctx.config?.name) {
				const envSourcePath = join(absoluteProjectDir, `.env.${ctx.config.name}`);
				const envDestPath = join(buildResult.outputDir, '.env');

				if (await pathExists(envSourcePath)) {
					await copyFile(envSourcePath, envDestPath);
					ctx.logger.debug(`Copied ${envSourcePath} to ${envDestPath}`);
				} else {
					ctx.logger.debug(`No .env.${ctx.config.name} file found, skipping env copy`);
				}
			}

			tui.success(`Build complete (${frameworkLabel}, ${buildResult.duration}ms)`);

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
			// Translate structured pipeline errors into the CLI's fatal surface.
			if (error instanceof FrameworkDetectionError) {
				collector.addGeneralError('build', error.message, 'BUILD010');
				if (opts.reportFile) await collector.forceWrite();
				clearGlobalCollector();
				tui.fatal(error.message, ErrorCode.BUILD_FAILED);
			}
			if (error instanceof TypecheckError) {
				console.error('');
				console.error(error.output);
				console.error('');
				if (opts.reportFile) await collector.forceWrite();
				clearGlobalCollector();
				tui.fatal('Fix type errors before building', ErrorCode.BUILD_FAILED);
			}
			// Fall through to the original generic error handler below.
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
