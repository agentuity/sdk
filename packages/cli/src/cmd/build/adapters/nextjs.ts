/**
 * Next.js build adapter.
 *
 * Handles Next.js-specific build concerns:
 * 1. Ensures standalone output mode is configured
 * 2. Wipes the staging output dir, then copies standalone + static assets
 * 3. Sets up the correct start command, accounting for the
 *    monorepo layout Next.js uses when `outputFileTracingRoot`
 *    points at a parent of the project (the standalone bundle
 *    nests `server.js` under the project's relative path).
 */

import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';
import { copyRuntimeManifests, installDependencies, runBuildCommand } from './generic.ts';
import { prepareNextCdnBuild } from './cdn-recipes.ts';

function toPosixPath(p: string): string {
	return p.split('\\').join('/');
}

/**
 * Wipe and recreate the package output directory so prior builds cannot
 * leave a stale root `server.js` (or other files) that outrank the new
 * standalone tree.
 */
export function resetOutputDir(outputDir: string): void {
	if (existsSync(outputDir)) {
		rmSync(outputDir, { recursive: true, force: true });
	}
	mkdirSync(outputDir, { recursive: true });
}

/**
 * Collect every `server.js` under the standalone tree, skipping
 * `node_modules` and `.git`.
 */
export function listStandaloneServers(standaloneRoot: string): string[] {
	const skipDirs = new Set(['node_modules', '.git']);
	const found: string[] = [];
	const stack: string[] = [standaloneRoot];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (skipDirs.has(entry)) continue;
			const full = join(dir, entry);
			let isDir: boolean;
			try {
				isDir = statSync(full).isDirectory();
			} catch {
				continue;
			}
			if (entry === 'server.js' && !isDir) {
				found.push(full);
				continue;
			}
			if (isDir) stack.push(full);
		}
	}
	return found;
}

/**
 * Pick the project's standalone `server.js`.
 *
 * Preference order:
 *  1. Preferred relative paths (monorepo subpath, project basename)
 *  2. Root `server.js` (single-package standalone)
 *  3. Shallowest remaining candidate (fewest path segments)
 *
 * Preferring explicit project paths avoids picking a **stale** root
 * `server.js` left from an earlier package when Next nests the real
 * entry under `<projectName>/` because `outputFileTracingRoot` pointed
 * at a parent directory (e.g. a parent-folder lockfile).
 */
export function selectStandaloneServer(
	standaloneRoot: string,
	preferredRelDirs: string[] = []
): string | null {
	const candidates = listStandaloneServers(standaloneRoot);
	if (candidates.length === 0) return null;
	if (candidates.length === 1) return candidates[0]!;

	const byRel = new Map<string, string>();
	for (const abs of candidates) {
		byRel.set(toPosixPath(relative(standaloneRoot, abs)), abs);
	}

	for (const dir of preferredRelDirs) {
		const rel = dir ? `${toPosixPath(dir).replace(/^\/+|\/+$/g, '')}/server.js` : 'server.js';
		const hit = byRel.get(rel);
		if (hit) return hit;
	}

	// Root server.js when present
	const root = byRel.get('server.js');
	if (root) return root;

	// Shallowest (then stable sort)
	const sorted = [...candidates].sort((a, b) => {
		const ra = toPosixPath(relative(standaloneRoot, a));
		const rb = toPosixPath(relative(standaloneRoot, b));
		const da = ra.split('/').length;
		const db = rb.split('/').length;
		if (da !== db) return da - db;
		return ra.localeCompare(rb);
	});
	return sorted[0] ?? null;
}

/**
 * @deprecated Use {@link selectStandaloneServer}. Kept as a thin alias for
 * call sites / tests that expect the old name.
 */
export function findStandaloneServer(standaloneRoot: string): string | null {
	return selectStandaloneServer(standaloneRoot);
}

/**
 * Ensure next.config has output: 'standalone'.
 *
 * Rather than modifying the user's config file, we set the NEXT_PRIVATE_STANDALONE env var
 * which can be read in next.config.js, or we check if standalone is already configured.
 * As a fallback, we also set the experimental config via env.
 */
function getNextBuildEnv(monorepoRoot?: string): Record<string, string> {
	const env: Record<string, string> = {
		// Signal to the build that we want standalone output
		NEXT_PRIVATE_STANDALONE: 'true',
	};
	// In monorepo mode, point Next.js's file-tracing at the workspace
	// root so the standalone bundle pulls in workspace-package source
	// files alongside the app's own traced dependencies. Without this,
	// `require('@workspace/shared')` at runtime would miss because the
	// trace would only see the subpackage's own `node_modules`.
	if (monorepoRoot) {
		env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = monorepoRoot;
	}
	return env;
}

export const nextjsAdapter: BuildAdapter = {
	name: 'nextjs',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const { projectDir, framework, outputDir, logger, monorepo } = options;
		const started = Date.now();
		const logs: string[] = [];

		// Detect standalone on the *user* config before CDN prep wraps it.
		const nextConfigPath = await findNextConfig(projectDir);
		let standaloneConfigured = false;
		if (nextConfigPath) {
			const content = readFileSync(nextConfigPath, 'utf-8');
			standaloneConfigured =
				content.includes("'standalone'") || content.includes('"standalone"');
		}

		// prepareNextCdnBuild rolls back on throw; once it returns we always
		// cleanup in finally (even if the build body fails).
		let cdnPrep: ReturnType<typeof prepareNextCdnBuild> | undefined;
		try {
			cdnPrep = prepareNextCdnBuild(options);
			logs.push(...cdnPrep.logs);

			// Step 1: Install dependencies. In monorepo mode, install runs at
			// the workspace root so `workspace:*` refs resolve before the
			// Next.js build kicks in.
			const installCwd = monorepo?.root ?? projectDir;
			logger.debug('Installing dependencies...');
			const installStart = Date.now();
			await installDependencies(installCwd, framework.packageManager, logger);
			logs.push(`✓ Dependencies installed in ${Date.now() - installStart}ms`);

			if (!standaloneConfigured) {
				logger.debug(
					'Standalone output not detected in next.config — setting NEXT_PRIVATE_STANDALONE=true'
				);
			}

			// Step 2: Run the build with standalone + CDN env. In monorepo mode we
			// also set `NEXT_PRIVATE_OUTPUT_TRACE_ROOT` to the workspace root
			// so the standalone bundle traces deps from the right base.
			const buildEnv = {
				...framework.buildEnv,
				...getNextBuildEnv(monorepo?.root),
				...cdnPrep.buildEnv,
			};

			logger.debug(`Running Next.js build: ${framework.buildCommand}`);
			const buildStart = Date.now();
			await runBuildCommand(
				projectDir,
				framework.buildCommand,
				framework.packageManager,
				buildEnv,
				logger,
				monorepo ? [join(monorepo.root, 'node_modules', '.bin')] : []
			);
			logs.push(`✓ Next.js build completed in ${Date.now() - buildStart}ms`);

			// Step 4: Package the standalone output into a clean staging dir.
			// Always wipe first — cpSync merges and would leave a stale root
			// server.js from a previous build that outranks a nested entry.
			resetOutputDir(outputDir);

			const standalonePath = join(projectDir, '.next', 'standalone');
			const staticPath = join(projectDir, '.next', 'static');
			const publicPath = join(projectDir, 'public');

			if (existsSync(standalonePath)) {
				// Copy the entire standalone tree verbatim. Next.js writes
				// paths relative to its `outputFileTracingRoot`, so for a
				// monorepo project the layout already reflects the project's
				// position in the workspace. Preserving that exactly is what
				// makes server.js's hard-coded `process.chdir(__dirname)`
				// resolve `.next/server`, `.next/static`, `public/`, etc.
				logger.debug('Copying standalone server...');
				cpSync(standalonePath, outputDir, { recursive: true });

				// Prefer monorepo subpath, then project directory name (common
				// when outputFileTracingRoot is a parent folder).
				const preferredDirs = [monorepo?.subpath, basename(projectDir)].filter(
					(d): d is string => !!d && d !== '.' && d !== '..'
				);

				const serverJs = selectStandaloneServer(outputDir, preferredDirs);
				if (!serverJs) {
					throw new Error(
						'Next.js standalone build did not produce a server.js. ' +
							'Check that next.config sets `output: "standalone"` and the build ' +
							'completed successfully.'
					);
				}
				const serverDir = dirname(serverJs);
				const serverDirRel = toPosixPath(relative(outputDir, serverDir));
				const nested =
					serverDirRel !== '' && serverDirRel !== '.' && !serverDirRel.startsWith('..');

				// Launch process root: monorepo subpath, or accidental nest
				// from outputFileTracingRoot, else deploy root.
				let workingDirectory: string | undefined;
				let serverEntryRel: string;
				if (monorepo?.subpath) {
					workingDirectory = monorepo.subpath;
					serverEntryRel = toPosixPath(relative(join(outputDir, monorepo.subpath), serverJs));
					if (serverEntryRel.startsWith('..')) {
						// Server outside monorepo subpath — fall back to path from output root.
						workingDirectory = nested ? serverDirRel : undefined;
						serverEntryRel = nested
							? 'server.js'
							: toPosixPath(relative(outputDir, serverJs));
					}
				} else if (nested) {
					workingDirectory = serverDirRel;
					serverEntryRel = 'server.js';
					logs.push(
						`✓ Nested standalone entry at ${serverDirRel}/server.js ` +
							`(outputFileTracingRoot layout) — launch.workingDirectory=${serverDirRel}`
					);
				} else {
					serverEntryRel = toPosixPath(relative(outputDir, serverJs)) || 'server.js';
				}

				// Copy static assets into <serverDir>/.next/static so Next.js
				// finds them at the path it bakes into the bundle. Standalone
				// mode intentionally omits `static/` (it's content-hashed and
				// usually CDN-served), so we always re-add it from the
				// project's `.next/static`.
				let packagedStaticDir: string | undefined;
				if (existsSync(staticPath)) {
					const staticDst = join(serverDir, '.next', 'static');
					mkdirSync(staticDst, { recursive: true });
					cpSync(staticPath, staticDst, { recursive: true });
					packagedStaticDir = staticDst;
				}

				// Copy `public/` next to server.js for the same reason.
				if (existsSync(publicPath)) {
					const publicDst = join(serverDir, 'public');
					mkdirSync(publicDst, { recursive: true });
					cpSync(publicPath, publicDst, { recursive: true });
				}

				logs.push(
					`✓ Standalone output packaged (server entry: ${
						workingDirectory ? `${workingDirectory}/${serverEntryRel}` : serverEntryRel
					})`
				);

				return {
					outputDir,
					startCommand: `node ${serverEntryRel}`,
					serverEntry: serverEntryRel,
					workingDirectory,
					staticDir: packagedStaticDir,
					staticAssetPublicPath: framework.staticAssetPublicPath,
					port: framework.port ?? 3000,
					duration: Date.now() - started,
					logs,
				};
			}

			// Fallback: no standalone output. Copy the whole .next directory
			// and the package manifests Hadron needs to install production
			// dependencies before launch. This path is brittle (`next start`
			// needs the full Next.js install) so we warn the user.
			logger.debug('No standalone output found — copying full .next directory');
			const nextDst = join(outputDir, '.next');
			cpSync(join(projectDir, '.next'), nextDst, { recursive: true });
			copyRuntimeManifests(projectDir, outputDir, [], framework.packageManager);

			logs.push('⚠ No standalone output — using full build (consider enabling standalone mode)');

			return {
				outputDir,
				startCommand: 'node node_modules/.bin/next start',
				serverEntry: undefined,
				staticDir: existsSync(join(outputDir, '.next', 'static'))
					? join(outputDir, '.next', 'static')
					: undefined,
				staticAssetPublicPath: framework.staticAssetPublicPath,
				port: framework.port ?? 3000,
				duration: Date.now() - started,
				logs,
			};
		} finally {
			cdnPrep?.cleanup();
		}
	},
};

async function findNextConfig(projectDir: string): Promise<string | null> {
	const candidates = [
		'next.config.js',
		'next.config.mjs',
		'next.config.ts',
		'next.config.mts',
		'next.config.cjs',
	];

	for (const name of candidates) {
		const path = join(projectDir, name);
		if (existsSync(path)) return path;
	}

	return null;
}
