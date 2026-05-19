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
import type { MonorepoContext } from '../detect/monorepo.ts';

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

/**
 * Per-package-manager lockfile filenames, in canonical order.
 * `copyRuntimeManifests` uses this to ship only the lockfile that
 * matches the active package manager, so stale rogue lockfiles
 * (e.g. a `bun.lock` left over from a default-pm install in a
 * monorepo subpackage) don't end up next to the real one and
 * confuse Hadron's preference order (bun > npm > pnpm > yarn).
 */
const LOCKFILES_BY_PM: Record<string, readonly string[]> = {
	npm: ['package-lock.json', 'npm-shrinkwrap.json'],
	pnpm: ['pnpm-lock.yaml'],
	yarn: ['yarn.lock'],
	bun: ['bun.lock', 'bun.lockb'],
};

export function copyRuntimeManifests(
	projectDir: string,
	outputDir: string,
	runtimeDependencies: string[] = [],
	packageManager?: string
): void {
	// Always ship the manifest.
	const pkgSrc = join(projectDir, 'package.json');
	const pkgDst = join(outputDir, 'package.json');
	if (existsSync(pkgSrc) && !existsSync(pkgDst)) {
		cpSync(pkgSrc, pkgDst);
	}

	// Ship only the lockfile that matches the active pm. When the
	// caller didn't pin a pm (older call sites), fall back to the
	// legacy behavior of shipping every lockfile present — callers
	// should pass `packageManager` to avoid this ambiguity.
	const lockfiles = packageManager
		? (LOCKFILES_BY_PM[packageManager] ?? [])
		: ([
				'package-lock.json',
				'npm-shrinkwrap.json',
				'pnpm-lock.yaml',
				'yarn.lock',
				'bun.lock',
				'bun.lockb',
			] as const);
	for (const name of lockfiles) {
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

/**
 * Recursively copy the monorepo tree from `monorepo.root` into
 * `outputDir`, excluding directories that must never ship (or that
 * would explode upload size: every nested `node_modules`, the VCS dir,
 * agent dotfiles, dev env files).
 *
 * Build artifacts already live inside the tree at their natural
 * paths (e.g. `<root>/apps/web/dist/`); this single pass picks them
 * up along with every workspace package's source. The deploy zip
 * filter (`cmd/cloud/deploy/upload.ts`) re-applies the same
 * exclusions defensively so anything new we drop in here (e.g. a
 * staging `.agentuity/` sibling) doesn't slip through either.
 */
function copyMonorepoTree(
	monorepo: MonorepoContext,
	outputDir: string,
	logger: { debug: (...args: unknown[]) => void }
): void {
	const absOut = resolve(outputDir);
	// If the staging dir lives inside the monorepo (it does by default
	// at `<root>/.agentuity/`), skipping it during the walk prevents an
	// infinite copy-into-self loop.
	const outRelToRoot = relative(monorepo.root, absOut);
	const skipNames = new Set(['node_modules', '.git', '.ssh', '.vite', '.agentuity', '.DS_Store']);

	function walk(src: string, dst: string): void {
		mkdirSync(dst, { recursive: true });
		for (const entry of readdirSync(src, { withFileTypes: true })) {
			if (skipNames.has(entry.name)) continue;
			if (entry.name.startsWith('.env')) continue;
			const srcChild = join(src, entry.name);
			const dstChild = join(dst, entry.name);
			const relFromMonorepo = relative(monorepo.root, srcChild);
			if (relFromMonorepo === outRelToRoot) continue; // skip the staging dir itself
			if (entry.isDirectory()) {
				walk(srcChild, dstChild);
			} else if (entry.isSymbolicLink()) {
				// Resolve symlinks during copy. `node_modules` symlinks have
				// already been skipped above; everything else is either a
				// genuine source link or a regular file pretending to be one.
				cpSync(srcChild, dstChild, { dereference: true });
			} else {
				cpSync(srcChild, dstChild);
			}
		}
	}

	logger.debug(`Mirroring monorepo from ${monorepo.root} to ${absOut}`);
	walk(monorepo.root, absOut);
}

/**
 * Finish the build for monorepo mode: pick the right start command,
 * inject the static server when none is set, copy root runtime
 * manifests, and return a `BuildResult`. Mirrors the post-copy steps
 * in `genericAdapter.build` but adapted to the monorepo tree layout
 * (start commands live under `<outputDir>/<subpath>/...`, manifests
 * come from the workspace root).
 */
async function finishMonorepoBuild(
	options: BuildAdapterOptions,
	started: number,
	logs: string[]
): Promise<BuildResult> {
	const { framework, outputDir, monorepo } = options;
	if (!monorepo) throw new Error('finishMonorepoBuild called without monorepo context');

	let { startCommand, serverEntry } = framework;

	if (!startCommand) {
		// Static SPA in a monorepo — inject the static server inside the
		// subpackage's build output directory so it serves the right
		// `index.html`. `processes[].workingDirectory` later points at
		// the subpackage so the launch command resolves correctly.
		const { injectStaticServer } = await import('./static-server.ts');
		const subBuildOut = resolve(outputDir, monorepo.subpath, framework.buildOutput);
		if (existsSync(subBuildOut)) {
			const injected = injectStaticServer(subBuildOut);
			startCommand = injected.startCommand;
			serverEntry = injected.serverEntry;
			logs.push('✓ Injected static file server (no start script found)');
		} else {
			throw new Error(
				`Monorepo subpackage at ${monorepo.subpath} produced no start command and ` +
					`no build output at ${framework.buildOutput}. Add a "start" script or a build step.`
			);
		}
	}

	// Source root manifests so Hadron's runtime install sees the full
	// workspaces config. The subpackage's own manifest is still inside
	// the copied tree at <outputDir>/<subpath>/package.json.
	copyRuntimeManifests(
		monorepo.root,
		outputDir,
		framework.runtimeDependencies ?? [],
		framework.packageManager
	);

	// Static asset enumeration for CDN upload. In monorepo mode the
	// build output lives under `<outputDir>/<subpath>/<framework.buildOutput>`.
	let resolvedStaticDir: string | undefined;
	if (framework.staticDir) {
		const candidate = resolve(outputDir, monorepo.subpath, framework.staticDir);
		if (existsSync(candidate)) resolvedStaticDir = candidate;
	}

	return {
		outputDir,
		startCommand,
		serverEntry,
		staticDir: resolvedStaticDir,
		port: framework.port,
		duration: Date.now() - started,
		logs,
	};
}

export const genericAdapter: BuildAdapter = {
	name: 'generic',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const { projectDir, framework, outputDir, logger } = options;
		const started = Date.now();
		const logs: string[] = [];
		let preparation: BuildPreparation | undefined;

		// Monorepo mode plumbing.
		//
		// When the project lives inside a workspace, `install` runs at
		// the workspace root so pnpm/npm/yarn/bun resolve `workspace:*`
		// refs natively. The build itself still runs in the subpackage
		// directory — each pm hoists `.bin` such that the local build
		// command (e.g. `next build`, `vite build`) resolves correctly
		// from inside the subpackage, and this matches how the user
		// invokes the build locally.
		const installCwd = options.monorepo?.root ?? projectDir;
		const buildCwd = projectDir;

		try {
			// Step 1: Install dependencies when the project has a package.json.
			// Bare static HTML projects intentionally have no package setup; they
			// are copied as-is and launched by the platform static server command.
			if (existsSync(join(installCwd, 'package.json'))) {
				logger.debug('Installing dependencies...');
				const installStart = Date.now();
				await installDependencies(installCwd, framework.packageManager, logger);
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
					buildCwd,
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

		// In monorepo mode, the deploy artifact mirrors the monorepo
		// root: every workspace package, the root manifest, and the root
		// lockfile all ship together so Hadron's runtime install can
		// resolve `workspace:*` refs the same way the user does locally.
		// Build artifacts already live inside the subpackage tree (e.g.
		// `apps/web/dist/`), so a single recursive copy captures both
		// the source workspace and the built output in one pass.
		if (options.monorepo) {
			mkdirSync(resolve(outputDir), { recursive: true });
			copyMonorepoTree(options.monorepo, resolve(outputDir), logger);
			logs.push(`✓ Copied monorepo (root: ${relative(buildCwd, options.monorepo.root) || '.'})`);
			return finishMonorepoBuild(options, started, logs);
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
		// (Monorepo mode takes a separate early-return path above and
		// sources manifests from the workspace root in `finishMonorepoBuild`.)
		copyRuntimeManifests(
			projectDir,
			outputDir,
			framework.runtimeDependencies ?? [],
			framework.packageManager
		);

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
