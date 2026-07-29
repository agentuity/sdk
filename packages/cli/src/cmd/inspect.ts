import { resolve } from 'node:path';
import { z } from 'zod';
import { getCommand } from '../command-prefix.ts';
import { detectFrameworkWithPackageJson } from './build/detect/index.ts';
import { detectMonorepoContext } from './build/detect/monorepo.ts';
import { LaunchConfigError, readUserLaunchOverride } from './build/package/launch.ts';
import { createError, ErrorCode, exitWithError } from '../errors.ts';
import { isJSONMode } from '../output.ts';
import * as tui from '../tui.ts';
import { createCommand } from '../types.ts';

const INSPECT_SCHEMA_VERSION = 1;

const InspectOptionsSchema = z.object({
	dir: z.string().optional().describe('Project directory to inspect (default: current directory)'),
});

const InspectBuildCommandSchema = z
	.discriminatedUnion('kind', [
		z.object({
			kind: z.literal('package-script'),
			name: z
				.string()
				.describe('package.json script name to run via the detected package manager'),
		}),
		z.object({
			kind: z.literal('command'),
			command: z.string().describe('Raw shell command'),
		}),
	])
	.nullable()
	.describe(
		'Detector-level classification of the build step, not the final build/launch instruction — adapters may resolve the real command at build time. Null when no build step is required.'
	);

const InspectResponseSchema = z.object({
	schemaVersion: z.literal(INSPECT_SCHEMA_VERSION).describe('Version of this response shape'),
	directory: z.string().describe('Absolute path to the inspected project directory'),
	framework: z.string().describe('Detected framework slug'),
	runtime: z.enum(['node', 'bun']).describe('Runtime used to start the built application'),
	packageManager: z.enum(['bun', 'npm', 'pnpm', 'yarn']).describe('Detected package manager'),
	detectedServerEntry: z
		.string()
		.nullable()
		.describe(
			'Server entry the detector inferred, relative to buildOutput; not the final launch entrypoint — adapters may resolve the real entry at build time'
		),
	commands: z.object({
		dev: z.string().nullable().describe('Development command from package.json'),
		build: InspectBuildCommandSchema,
		start: z.string().nullable().describe('Detected start command'),
	}),
	buildOutput: z.string().describe('Build output path relative to the project directory'),
	port: z.number().int().nullable().describe('Port the application listens on, when known'),
	confidence: z
		.enum(['high', 'medium', 'low'])
		.describe('How confidently the framework detector matched this project'),
	warnings: z
		.array(z.string())
		.describe('Non-fatal advisories from framework detection (empty when none)'),
	monorepo: z
		.object({
			root: z.string().describe('Absolute path to the workspace root'),
			workingDirectory: z.string().describe('Project path relative to the workspace root'),
			packageManager: z
				.enum(['bun', 'npm', 'pnpm', 'yarn'])
				.describe('Package manager used by the workspace'),
		})
		.nullable()
		.describe('Enclosing workspace details, when the project is a workspace member'),
});

export const command = createCommand({
	name: 'inspect',
	description: 'Inspect a local project without authentication or cloud linking.',
	skipUpgradeCheck: true,
	skipInternalLogging: true,
	skipConfigLoad: true,
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{
			command: getCommand('--json inspect'),
			description: 'Inspect the current directory as JSON',
		},
		{
			command: getCommand('--json inspect --dir ./apps/web'),
			description: 'Inspect a project in another directory',
		},
	],
	schema: {
		options: InspectOptionsSchema,
		response: InspectResponseSchema,
	},

	async handler(ctx) {
		const directory = resolve(ctx.opts.dir ?? process.cwd());

		let framework: Awaited<ReturnType<typeof detectFrameworkWithPackageJson>>['framework'];
		let packageJson: Awaited<ReturnType<typeof detectFrameworkWithPackageJson>>['packageJson'];
		let monorepo: Awaited<ReturnType<typeof detectMonorepoContext>>;
		try {
			// Validate launch.json structurally even when detection never reaches
			// the custom-launcher fallback (e.g. a Vite project) — otherwise a
			// malformed override passes inspect but still fails build later.
			// Return value unused; the call's only job here is validation.
			readUserLaunchOverride(directory);
			[{ framework, packageJson }, monorepo] = await Promise.all([
				detectFrameworkWithPackageJson(directory),
				detectMonorepoContext(directory),
			]);
		} catch (error) {
			if (error instanceof LaunchConfigError) {
				exitWithError(
					createError(ErrorCode.CONFIG_INVALID, error.message, { issues: error.issues }),
					ctx.logger,
					ctx.options.errorFormat
				);
			}
			throw error;
		}

		if (!framework) {
			exitWithError(
				createError(
					ErrorCode.PROJECT_NOT_FOUND,
					`Could not detect a deployable project in ${directory}`
				),
				ctx.logger,
				ctx.options.errorFormat
			);
		}

		const build: z.infer<typeof InspectBuildCommandSchema> = (() => {
			if (framework.buildCommandKind === 'none') return null;
			if (framework.buildCommandKind === 'package-script') {
				return { kind: 'package-script' as const, name: framework.buildCommand };
			}
			// 'command', or undefined for detectors that predate this field —
			// buildCommand is a terminal-runnable string either way.
			return { kind: 'command' as const, command: framework.buildCommand };
		})();

		const result: z.infer<typeof InspectResponseSchema> = {
			schemaVersion: INSPECT_SCHEMA_VERSION,
			directory,
			framework: framework.name,
			runtime: framework.runtime,
			packageManager: framework.packageManager,
			detectedServerEntry: framework.serverEntry ?? null,
			commands: {
				dev: packageJson?.scripts?.dev ?? null,
				build,
				start: framework.startCommand ?? null,
			},
			buildOutput: framework.buildOutput,
			port: framework.port ?? null,
			confidence: framework.confidence,
			warnings: framework.warnings ?? [],
			monorepo: monorepo
				? {
						root: monorepo.root,
						workingDirectory: monorepo.subpath,
						packageManager: monorepo.packageManager,
					}
				: null,
		};

		if (!isJSONMode(ctx.options)) {
			tui.output(`Framework: ${result.framework}`);
			tui.output(`Runtime: ${result.runtime}`);
			tui.output(`Package manager: ${result.packageManager}`);
			const buildLabel = result.commands.build
				? result.commands.build.kind === 'package-script'
					? `${result.packageManager} run ${result.commands.build.name}`
					: result.commands.build.command
				: 'none';
			tui.output(`Build command: ${buildLabel}`);
			if (result.commands.dev) tui.output(`Dev command: ${result.commands.dev}`);
			if (result.monorepo) {
				tui.output(`Working directory: ${result.monorepo.workingDirectory}`);
			}
		}

		return result;
	},
});
