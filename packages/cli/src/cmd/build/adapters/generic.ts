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

import { join, resolve, relative } from 'node:path';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types';
import { getRunCommand } from '../detect/util';

/**
 * Run a shell command and return exit code.
 */
async function runCommand(
	cmd: string[],
	cwd: string,
	env?: Record<string, string>
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(cmd, {
		cwd,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	await proc.exited;

	return {
		exitCode: proc.exitCode ?? 1,
		stdout,
		stderr,
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

	const result = await runCommand(cmd, projectDir, buildEnv);
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

		// Only copy if the build output is a distinct directory from the output dir
		// AND the output dir is not inside the build output (which would cause infinite recursion)
		const shouldCopy =
			existsSync(buildOutputPath) &&
			buildOutputPath !== resolvedOutputDir &&
			!resolvedOutputDir.startsWith(buildOutputPath + '/');

		if (shouldCopy) {
			logger.debug(`Copying build output from ${buildOutputPath} to ${resolvedOutputDir}`);
			mkdirSync(resolvedOutputDir, { recursive: true });
			cpSync(buildOutputPath, resolvedOutputDir, {
				recursive: true,
				filter: (src) => {
					// Never copy the output dir into itself
					const rel = relative(resolvedOutputDir, src);
					return rel.startsWith('..');
				},
			});
		} else {
			// Ensure output dir exists even when we skip the copy
			mkdirSync(resolvedOutputDir, { recursive: true });
		}

		// Step 4: Determine start command — inject static file server if none exists
		let { startCommand, serverEntry } = framework;

		if (!startCommand) {
			// No start command (static-only build) — inject a minimal file server
			const { injectStaticServer } = await import('./static-server');
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

		const staticDir = framework.staticDir ? join(outputDir, framework.staticDir) : undefined;

		return {
			outputDir,
			startCommand,
			serverEntry,
			staticDir: staticDir && existsSync(staticDir) ? staticDir : undefined,
			port: framework.port,
			duration: Date.now() - started,
			logs,
		};
	},
};
