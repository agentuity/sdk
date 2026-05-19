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

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
	logger: { debug: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void }
): Promise<void> {
	// Strict (lockfile-honoring) install first. If the lockfile is out
	// of sync — a common case after the user adds a dependency without
	// regenerating the lockfile, or after the lockfile picks up
	// platform-specific optional natives from a different machine —
	// fall back to a regular install. Better to deploy than to fail
	// builds on lockfile drift.
	let strict: string[];
	let fallback: string[];
	switch (packageManager) {
		case 'bun':
			// `bun install` already tolerates lockfile drift.
			strict = ['bun', 'install'];
			fallback = ['bun', 'install'];
			break;
		case 'pnpm':
			strict = ['pnpm', 'install', '--frozen-lockfile'];
			fallback = ['pnpm', 'install'];
			break;
		case 'yarn':
			strict = ['yarn', 'install', '--frozen-lockfile'];
			fallback = ['yarn', 'install'];
			break;
		default:
			strict = ['npm', 'ci'];
			// `--include=optional` so platform-specific optional natives
			// (lightningcss, @parcel/watcher, sharp, @emnapi/*) get pulled
			// for the current arch even when the lockfile only recorded a
			// different host's variants.
			fallback = ['npm', 'install', '--include=optional'];
			break;
	}

	logger.debug(`Installing dependencies with: ${strict.join(' ')}`);
	const result = await runCommand(strict, projectDir);
	if (result.exitCode === 0) return;

	if (strict.join(' ') === fallback.join(' ')) {
		throw new Error(
			`Dependency installation failed (exit ${result.exitCode}):\n${result.stderr}`
		);
	}

	logger.warn?.(
		`Lockfile-strict install failed; retrying with \`${fallback.join(' ')}\`. ` +
			'Regenerating the lockfile locally avoids this fallback.'
	);
	logger.debug(`Installing dependencies with: ${fallback.join(' ')}`);
	const retry = await runCommand(fallback, projectDir);
	if (retry.exitCode !== 0) {
		throw new Error(`Dependency installation failed (exit ${retry.exitCode}):\n${retry.stderr}`);
	}
}

/**
 * Run the framework's build command.
 */
const ROOT_LIFECYCLE_SCRIPTS = new Set(['preinstall', 'install', 'postinstall', 'prepare']);

function promoteDependency(pkg: Record<string, unknown>, name: string): void {
	const dependencies = (pkg.dependencies ?? {}) as Record<string, string>;
	const devDependencies = (pkg.devDependencies ?? {}) as Record<string, string>;
	const version = dependencies[name] ?? devDependencies[name];
	if (!version) return;

	dependencies[name] = version;
	delete devDependencies[name];
	pkg.dependencies = dependencies;
	pkg.devDependencies = devDependencies;
}

function rewriteRuntimePackageJson(packageJsonPath: string, runtimeDependencies: string[]): void {
	const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
	const scripts = (pkg.scripts ?? {}) as Record<string, string>;

	for (const name of ROOT_LIFECYCLE_SCRIPTS) {
		delete scripts[name];
	}
	pkg.scripts = scripts;

	for (const dependency of runtimeDependencies) {
		promoteDependency(pkg, dependency);
	}

	writeFileSync(packageJsonPath, JSON.stringify(pkg, null, '\t') + '\n');
}

export function copyRuntimeManifests(
	projectDir: string,
	outputDir: string,
	runtimeDependencies: string[] = []
): void {
	for (const name of [
		'package.json',
		'package-lock.json',
		'npm-shrinkwrap.json',
		'pnpm-lock.yaml',
		'yarn.lock',
		'bun.lock',
		'bun.lockb',
	]) {
		const src = join(projectDir, name);
		const dst = join(outputDir, name);
		if (existsSync(src) && !existsSync(dst)) {
			cpSync(src, dst);
		}
	}

	const packageJsonPath = join(outputDir, 'package.json');
	if (existsSync(packageJsonPath)) {
		rewriteRuntimePackageJson(packageJsonPath, runtimeDependencies);
	}
}

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

interface BuildPreparation {
	cleanup: () => void;
}

async function installTransientDevDependencies(
	projectDir: string,
	packageManager: string,
	dependencies: string[],
	logger: { debug: (...args: unknown[]) => void }
): Promise<void> {
	if (dependencies.length === 0) return;

	const cmd = (() => {
		switch (packageManager) {
			case 'bun':
				return ['bun', 'add', '--dev', '--no-save', ...dependencies];
			case 'pnpm':
				return ['pnpm', 'add', '--save-dev', '--config.save=false', ...dependencies];
			case 'yarn':
				return ['yarn', 'add', '--dev', '--no-lockfile', ...dependencies];
			default:
				return ['npm', 'install', '--save-dev', '--no-save', ...dependencies];
		}
	})();

	logger.debug(`Installing transient build dependencies with: ${cmd.join(' ')}`);
	const result = await runCommand(cmd, projectDir);
	if (result.exitCode !== 0) {
		throw new Error(
			`Failed to install transient build dependencies (exit ${result.exitCode}):\n${result.stderr || result.stdout}`
		);
	}
}

async function prepareFrameworkBuild(
	projectDir: string,
	framework: BuildAdapterOptions['framework'],
	logger: { debug: (...args: unknown[]) => void }
): Promise<BuildPreparation | undefined> {
	await installTransientDevDependencies(
		projectDir,
		framework.packageManager,
		framework.buildPreinstallDevDependencies ?? [],
		logger
	);

	const cleanups: Array<() => void> = [];
	for (const replacement of framework.buildFileReplacements ?? []) {
		const filePath = join(projectDir, replacement.path);
		if (!existsSync(filePath)) continue;

		const original = readFileSync(filePath, 'utf-8');
		if (!original.includes(replacement.search)) continue;

		writeFileSync(filePath, original.replace(replacement.search, replacement.replacement));
		cleanups.push(() => writeFileSync(filePath, original));
	}

	if (cleanups.length === 0) return undefined;
	return {
		cleanup: () => {
			for (const cleanup of cleanups.reverse()) cleanup();
		},
	};
}

export const genericAdapter: BuildAdapter = {
	name: 'generic',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const { projectDir, framework, outputDir, logger } = options;
		const started = Date.now();
		const logs: string[] = [];
		let preparation: BuildPreparation | undefined;

		try {
			// Step 1: Install dependencies when the project has a package.json.
			// Bare static HTML projects intentionally have no package setup; they
			// are copied as-is and launched by the platform static server command.
			if (existsSync(join(projectDir, 'package.json'))) {
				logger.debug('Installing dependencies...');
				const installStart = Date.now();
				await installDependencies(projectDir, framework.packageManager, logger);
				logs.push(`✓ Dependencies installed in ${Date.now() - installStart}ms`);
			} else {
				logs.push('✓ No package.json found; skipped dependency installation');
			}

			preparation = await prepareFrameworkBuild(projectDir, framework, logger);

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
		} finally {
			preparation?.cleanup();
		}

		// Step 3: Copy build output to output directory.
		//
		// We have two valid layouts:
		//
		// (a) FLATTEN: copy the *contents* of buildOutput to the output
		//     dir. This is what static SPAs need so the injected
		//     `_serve.js` finds `index.html` at the root, and what
		//     SSR-with-no-start-script frameworks expect.
		//
		// (b) PRESERVE: keep the framework's output directory name
		//     (e.g. `.output/`, `dist/`) inside the deployed tree. Use
		//     this when the user's `start` script references that path
		//     (e.g. TanStack Start: `node .output/server/index.mjs`,
		//     Nuxt: same). Without preserve, the path in the start
		//     command wouldn't resolve at runtime.
		//
		// The presence of a user-defined start command (from
		// `framework.startCommand`, sourced from `pkg.scripts.start`
		// in detection) is the signal: a user-defined start script
		// implies user-known paths, so preserve.
		const buildOutputPath = resolve(projectDir, framework.buildOutput);
		const resolvedOutputDir = resolve(outputDir);
		const preserveBuildOutputDir =
			!!framework.startCommand &&
			framework.buildOutput !== '.' &&
			framework.buildOutput !== resolvedOutputDir;

		// Copy build output to the output directory when they differ.
		// When buildOutput is '.' (project root), the output dir is a subdirectory
		// of the source, so we iterate entries to avoid cpSync's self-copy check.
		const shouldCopy = existsSync(buildOutputPath) && buildOutputPath !== resolvedOutputDir;

		if (shouldCopy) {
			mkdirSync(resolvedOutputDir, { recursive: true });

			if (preserveBuildOutputDir) {
				// Mirror the framework's output directory name inside the
				// deployed tree, so user-supplied paths in the start command
				// resolve unchanged.
				const preservedDst = join(resolvedOutputDir, framework.buildOutput);
				logger.debug(
					`Copying build output from ${buildOutputPath} to ${preservedDst} (preserved)`
				);
				mkdirSync(preservedDst, { recursive: true });
				cpSync(buildOutputPath, preservedDst, { recursive: true });
			} else {
				logger.debug(`Copying build output from ${buildOutputPath} to ${resolvedOutputDir}`);
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

		// Step 5: Copy package manifests for Hadron's runtime dependency install.
		// Do not copy node_modules: Hadron installs production dependencies before launch.
		copyRuntimeManifests(projectDir, outputDir, framework.runtimeDependencies ?? []);

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
				// Static assets are within the copied build output. The destination
				// path depends on whether we preserved the build output dir name.
				const copyRoot = preserveBuildOutputDir
					? join(resolvedOutputDir, framework.buildOutput)
					: resolvedOutputDir;
				const relativeToOutput = relative(buildOutputPath, staticSrcPath);
				resolvedStaticDir = relativeToOutput ? join(copyRoot, relativeToOutput) : copyRoot;
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
