import { z } from 'zod';
import { resolve, join } from 'node:path';
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
		const { opts, projectDir, project, config } = ctx;

		const absoluteProjectDir = resolve(projectDir);
		const outDir = opts.outdir ? resolve(opts.outdir) : join(absoluteProjectDir, '.agentuity');

		try {
			tui.info(`Bundling project at ${absoluteProjectDir} to ${outDir}`);

			const env: Map<string, string> = new Map();

			if (opts.dev) {
				if (config?.overrides?.transport_url) {
					env.set('AGENTUITY_TRANSPORT_URL', config.overrides.transport_url);
				}
				if (config?.overrides?.catalyst_url) {
					env.set('AGENTUITY_CATALYST_URL', config.overrides.catalyst_url);
				}
				if (config?.overrides?.vector_url) {
					env.set('AGENTUITY_VECTOR_URL', config.overrides.vector_url);
				}
				if (config?.overrides?.object_url) {
					env.set('AGENTUITY_OBJECTSTORE_URL', config.overrides.object_url);
				}
				if (config?.overrides?.kv_url) {
					env.set('AGENTUITY_KEYVALUE_URL', config.overrides.kv_url);
				}
				if (config?.overrides?.stream_url) {
					env.set('AGENTUITY_STREAM_URL', config.overrides.stream_url);
				}
				if (project) {
					env.set('AGENTUITY_CLOUD_ORG_ID', project.orgId);
					env.set('AGENTUITY_CLOUD_PROJECT_ID', project.projectId);
				}
			}

			await bundle({
				rootDir: absoluteProjectDir,
				dev: opts.dev || false,
				outDir,
				project,
				orgId: project?.orgId,
				projectId: project?.projectId,
				env,
			});

			// Run TypeScript type checking after registry generation (skip in dev mode)
			if (!opts.dev && !opts.skipTypeCheck) {
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
				bundlePath: outDir,
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
