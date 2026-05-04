/**
 * Generic build adapter.
 *
 * Handles any JS framework by:
 * 1. Installing dependencies
 * 2. Running the project's build script
 * 3. Copying the build output to the output directory
 *
 * This is the fallback for frameworks without a specific adapter,
 * and is also the base logic that specific adapters build on.
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { run } from '../../../node-compat/proc.ts';
import { getRunCommand } from '../detect/util.ts';
import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';

/**
 * Run a shell command and return exit code.
 */
async function runCommand(
	cmd: string[],
	cwd: string,
	env?: Record<string, string>
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const result = await run({ cmd, cwd, env });
	return {
		exitCode: result.exitCode ?? 1,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

/**
 * Install dependencies using the detected package manager.
 */
export async function installDependencies(
	projectDir: string,
	packageManager: string,
	logger: { debug: (...args: unknown[]) => void }
): Promise<void> {
	let cmd: string[];
	switch (packageManager) {
		case 'bun':
			cmd = ['bun', 'install'];
			break;
		case 'pnpm':
			cmd = ['pnpm', 'install', '--frozen-lockfile'];
			break;
		case 'yarn':
			cmd = ['yarn', 'install', '--frozen-lockfile'];
			break;
		default:
			cmd = ['npm', 'ci'];
			break;
	}

	logger.debug(`Installing dependencies with: ${cmd.join(' ')}`);

	const result = await runCommand(cmd, projectDir);
	if (result.exitCode !== 0) {
		throw new Error(
			`Dependency installation failed (exit ${result.exitCode}):\n${result.stderr}`
		);
	}
}

/**
 * Run the framework's build command.
 */
export async function runBuildCommand(
	projectDir: string,
	buildCommand: string,
	packageManager: string,
	buildEnv?: Record<string, string>,
	logger?: { debug: (...args: unknown[]) => void }
): Promise<{ stdout: string; stderr: string }> {
	// If it's a package.json script name, use the package manager's run command
	// If it contains spaces or special chars, it's likely a direct command
	const isScriptName = /^[a-zA-Z0-9_:-]+$/.test(buildCommand);

	let cmd: string[];
	if (isScriptName && buildCommand !== '__agentuity_internal__') {
		const runCmd = getRunCommand(packageManager as 'bun' | 'npm' | 'pnpm' | 'yarn');
		cmd = runCmd.split(' ').concat(buildCommand);
	} else {
		cmd = ['sh', '-c', buildCommand];
	}

	logger?.debug(`Running build command: ${cmd.join(' ')}`);

	// Mirror what `npm run`/`bun run` do automatically: prepend the
	// project's node_modules/.bin to PATH so locally-installed binaries
	// (vite, tsc, esbuild, etc.) resolve when shelling out to commands
	// like `vite build` or `tsc -b && vite build` via `sh -c`. Without
	// this, framework-defined buildCommands that aren't bare script
	// names fail with `command not found`.
	const localBin = join(projectDir, 'node_modules', '.bin');
	const envWithLocalBin: Record<string, string> = {
		...(buildEnv ?? {}),
		PATH: `${localBin}:${buildEnv?.PATH ?? process.env.PATH ?? ''}`,
	};

	const result = await runCommand(cmd, projectDir, envWithLocalBin);
	if (result.exitCode !== 0) {
		throw new Error(`Build failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`);
	}

	return { stdout: result.stdout, stderr: result.stderr };
}

export const genericAdapter: BuildAdapter = {
	name: 'generic',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const { projectDir, framework, outputDir, logger } = options;
		const started = Date.now();
		const logs: string[] = [];

		// Step 1: Install dependencies
		logger.debug('Installing dependencies...');
		const installStart = Date.now();
		await installDependencies(projectDir, framework.packageManager, logger);
		logs.push(`✓ Dependencies installed in ${Date.now() - installStart}ms`);

		// Step 2: Run the build command
		if (framework.buildCommand && framework.buildCommand !== '__agentuity_internal__') {
			logger.debug(`Running build: ${framework.buildCommand}`);
			const buildStart = Date.now();
			await runBuildCommand(
				projectDir,
				framework.buildCommand,
				framework.packageManager,
				framework.buildEnv,
				logger
			);
			logs.push(`✓ Build completed in ${Date.now() - buildStart}ms`);
		}

		// Step 3: Copy build output to output directory
		const buildOutputPath = resolve(projectDir, framework.buildOutput);
		const resolvedOutputDir = resolve(outputDir);

		// Copy build output to the output directory when they differ.
		// When buildOutput is '.' (project root), the output dir is a subdirectory
		// of the source, so we iterate entries to avoid cpSync's self-copy check.
		const shouldCopy = existsSync(buildOutputPath) && buildOutputPath !== resolvedOutputDir;

		if (shouldCopy) {
			logger.debug(`Copying build output from ${buildOutputPath} to ${resolvedOutputDir}`);
			mkdirSync(resolvedOutputDir, { recursive: true });

			// Skip directories that shouldn't be deployed
			const skipEntries = new Set([
				'node_modules',
				'.git',
				'.env',
				basename(resolvedOutputDir), // e.g., '.agentuity'
			]);

			const entries = readdirSync(buildOutputPath);
			for (const entry of entries) {
				if (skipEntries.has(entry)) continue;
				const srcPath = join(buildOutputPath, entry);
				const dstPath = join(resolvedOutputDir, entry);
				cpSync(srcPath, dstPath, { recursive: true });
			}
		} else {
			// Ensure output dir exists even when we skip the copy
			mkdirSync(resolvedOutputDir, { recursive: true });
		}

		// Step 4: Determine start command — inject static file server if none exists
		let { startCommand, serverEntry } = framework;

		if (!startCommand) {
			// No start command (static-only build) — inject a minimal file server
			const { injectStaticServer } = await import('./static-server.ts');
			const injected = injectStaticServer(outputDir);
			startCommand = injected.startCommand;
			serverEntry = injected.serverEntry;
			logs.push('✓ Injected static file server (no start script found)');
		}

		// Step 5: Copy package.json and node_modules for runtime
		const pkgJsonSrc = join(projectDir, 'package.json');
		const pkgJsonDst = join(outputDir, 'package.json');
		if (existsSync(pkgJsonSrc) && !existsSync(pkgJsonDst)) {
			cpSync(pkgJsonSrc, pkgJsonDst);
		}

		const nodeModulesSrc = join(projectDir, 'node_modules');
		const nodeModulesDst = join(outputDir, 'node_modules');
		if (existsSync(nodeModulesSrc) && !existsSync(nodeModulesDst)) {
			logger.debug('Copying node_modules for runtime dependencies...');
			cpSync(nodeModulesSrc, nodeModulesDst, { recursive: true });
		}

		// Step 6: Resolve static asset directory for CDN upload
		// staticDir is relative to the project root (set by framework detection).
		// If it matches buildOutput, the files are already in outputDir from the copy.
		// Otherwise, copy the static assets into the output so deploy can find them.
		let resolvedStaticDir: string | undefined;

		if (framework.staticDir) {
			const staticSrcPath = resolve(projectDir, framework.staticDir);
			const buildOutputPath = resolve(projectDir, framework.buildOutput);

			// Check if the static dir is inside the build output (already copied)
			if (staticSrcPath.startsWith(buildOutputPath + '/') || staticSrcPath === buildOutputPath) {
				// Static assets are within the copied build output
				const relativeToOutput = relative(buildOutputPath, staticSrcPath);
				resolvedStaticDir = relativeToOutput
					? join(resolvedOutputDir, relativeToOutput)
					: resolvedOutputDir;
			} else if (existsSync(staticSrcPath)) {
				// Static assets are outside the build output — copy them into the output
				const staticDstPath = join(resolvedOutputDir, framework.staticDir);
				logger.debug(`Copying static assets from ${staticSrcPath} to ${staticDstPath}`);
				mkdirSync(staticDstPath, { recursive: true });
				cpSync(staticSrcPath, staticDstPath, { recursive: true });
				resolvedStaticDir = staticDstPath;
				logs.push(`✓ Copied static assets from ${framework.staticDir}`);
			}
		}

		return {
			outputDir,
			startCommand,
			serverEntry,
			staticDir:
				resolvedStaticDir && existsSync(resolvedStaticDir) ? resolvedStaticDir : undefined,
			port: framework.port,
			duration: Date.now() - started,
			logs,
		};
	},
};
