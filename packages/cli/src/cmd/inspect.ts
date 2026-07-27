import { resolve } from 'node:path';
import { z } from 'zod';
import { getCommand } from '../command-prefix.ts';
import { detectFrameworkWithPackageJson } from './build/detect/index.ts';
import { detectMonorepoContext } from './build/detect/monorepo.ts';
import { createError, ErrorCode, exitWithError } from '../errors.ts';
import { isJSONMode } from '../output.ts';
import * as tui from '../tui.ts';
import { createCommand } from '../types.ts';

const INSPECT_SCHEMA_VERSION = 1;

const InspectOptionsSchema = z.object({
	dir: z.string().optional().describe('Project directory to inspect (default: current directory)'),
});

const InspectResponseSchema = z.object({
	schemaVersion: z.literal(INSPECT_SCHEMA_VERSION).describe('Version of this response shape'),
	directory: z.string().describe('Absolute path to the inspected project directory'),
	framework: z.string().describe('Detected framework slug'),
	runtime: z.enum(['node', 'bun']).describe('Runtime used to start the built application'),
	packageManager: z.enum(['bun', 'npm', 'pnpm', 'yarn']).describe('Detected package manager'),
	entrypoints: z.array(z.string()).describe('Detected server entrypoints'),
	commands: z.object({
		dev: z.string().nullable().describe('Development command from package.json'),
		build: z.string().describe('Detected build command'),
		start: z.string().nullable().describe('Detected start command'),
	}),
	buildOutput: z.string().describe('Build output path relative to the project directory'),
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
	description:
		'Inspect a Genesis import before the user authenticates, adds agentuity.json, or links a cloud project',
	skipUpgradeCheck: true,
	skipInternalLogging: true,
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
		const [{ framework, packageJson }, monorepo] = await Promise.all([
			detectFrameworkWithPackageJson(directory),
			detectMonorepoContext(directory),
		]);

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

		const result: z.infer<typeof InspectResponseSchema> = {
			schemaVersion: INSPECT_SCHEMA_VERSION,
			directory,
			framework: framework.name,
			runtime: framework.runtime,
			packageManager: framework.packageManager,
			entrypoints: framework.serverEntry ? [framework.serverEntry] : [],
			commands: {
				dev: packageJson?.scripts?.dev ?? null,
				build: framework.buildCommand,
				start: framework.startCommand ?? null,
			},
			buildOutput: framework.buildOutput,
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
			tui.output(`Build command: ${result.commands.build}`);
			if (result.commands.dev) tui.output(`Dev command: ${result.commands.dev}`);
			if (result.monorepo) {
				tui.output(`Working directory: ${result.monorepo.workingDirectory}`);
			}
		}

		return result;
	},
});
