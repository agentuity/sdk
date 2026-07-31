/**
 * Next.js build adapter.
 *
 * Handles Next.js-specific build concerns:
 * 1. Ensures standalone output mode is configured
 * 2. Copies the standalone directory + static assets to output
 * 3. Sets up the correct start command, accounting for the
 *    monorepo layout Next.js uses when `outputFileTracingRoot`
 *    points at a parent of the project (the standalone bundle
 *    nests `server.js` under the project's relative path).
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';
import { copyRuntimeManifests, installDependencies, runBuildCommand } from './generic.ts';
import { prepareNextCdnBuild } from './cdn-recipes.ts';

/**
 * Walk the standalone output looking for the project's `server.js`.
 *
 * In a non-monorepo project the server lives at the root of
 * `.next/standalone/server.js`. In a monorepo (or when the user has
 * set `outputFileTracingRoot`), Next.js preserves the project's
 * relative path under the standalone root, so the server may be
 * several levels deep — e.g.
 * `.next/standalone/apps/web/server.js`.
 *
 * Returns the absolute path to `server.js` if found, or `null`.
 * Skips `node_modules/` and any `tests/` test fixtures so we don't
 * pick up a vendored Next.js stub.
 */
function findStandaloneServer(standaloneRoot: string): string | null {
	const skipDirs = new Set(['node_modules', '.git']);
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
				return full;
			}
			if (isDir) stack.push(full);
		}
	}
	return null;
}

/**
 * Ensure next.config has output: 'standalone'.
 *
 * Rather than modifying the user's config file, we set the NEXT_OUTPUT env var
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

		const cdnPrep = prepareNextCdnBuild(options);
		logs.push(...cdnPrep.logs);

		try {
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

			// Step 4: Package the standalone output
			mkdirSync(outputDir, { recursive: true });

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

				// Find the actual `server.js` inside the standalone tree
				// (root for single-package projects, nested under the
				// project's relative path for monorepos). Everything else
				// hangs off this location.
				const serverJs = findStandaloneServer(outputDir);
				if (!serverJs) {
					throw new Error(
						'Next.js standalone build did not produce a server.js. ' +
							'Check that next.config sets `output: "standalone"` and the build ' +
							'completed successfully.'
					);
				}
				const serverDir = dirname(serverJs);
				// In monorepo mode, `processes[].workingDirectory = monorepo.subpath`
				// will cd pilot into the subpackage before exec; the start
				// command needs to be relative to *that* dir, not to the
				// output root. server.js lives at `<outputDir>/<subpath>/server.js`
				// so the relative-to-subpath path is just `server.js`.
				const serverEntryRel = monorepo
					? relative(join(outputDir, monorepo.subpath), serverJs)
					: relative(outputDir, serverJs);

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
					`✓ Standalone output packaged (server entry: ${serverEntryRel || 'server.js'})`
				);

				return {
					outputDir,
					startCommand: `node ${serverEntryRel}`,
					serverEntry: serverEntryRel,
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
			cdnPrep.cleanup();
		}
	},
};

async function findNextConfig(projectDir: string): Promise<string | null> {
	const candidates = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs'];

	for (const name of candidates) {
		const path = join(projectDir, name);
		if (existsSync(path)) return path;
	}

	return null;
}
