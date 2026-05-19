/**
 * Framework Detection
 *
 * Examines a project directory and determines which JS framework is being used.
 * Returns a DetectedFramework with all the information needed to build and launch.
 *
 * Detection strategy:
 * 1. Run the framework database engine (rules derived from @vercel/frameworks)
 * 2. Fall back to generic detection (package.json scripts)
 * 3. As a last resort, deploy bare static HTML projects that only have index.html
 */

import { join } from 'node:path';
import { pathExists } from '../../../node-compat/fs.ts';
import type { DetectedFramework, PackageJsonData } from './types.ts';
import { readPackageJson, detectPackageManager } from './util.ts';
import { frameworkDefinitions, type FrameworkDefinition } from './frameworks.ts';
import { detectFromDatabase } from './engine.ts';
import { genericDetector } from './generic.ts';
import { readUserLaunchOverride } from '../package/launch.ts';

/**
 * Custom-launcher fallback. If the user ships their own `launch.json`
 * at the project root and we couldn't match anything else, treat the
 * project as a deployable "custom" framework: skip the build (the
 * user is responsible for prebuilding), copy the project root into
 * the output, and let the user's launch.json supply the start command
 * and runtime. The user's launch.json is later merged on top of this
 * by `packageBuildOutput`.
 */
async function detectCustomLauncher(
	projectDir: string,
	pkg: PackageJsonData | null
): Promise<DetectedFramework | null> {
	const override = readUserLaunchOverride(projectDir);
	if (!override) return null;

	const webProcess =
		override.processes?.find((p) => p.type === 'web' && p.default) ??
		override.processes?.find((p) => p.type === 'web') ??
		override.processes?.[0];

	const startCommand = webProcess?.command;
	const declaredRuntime = override.runtime?.name;

	const pm = await detectPackageManager(projectDir);
	const hasBunLockfile =
		(await pathExists(join(projectDir, 'bun.lockb'))) ||
		(await pathExists(join(projectDir, 'bun.lock')));
	const runtime: 'bun' | 'node' = (() => {
		if (declaredRuntime === 'bun' || declaredRuntime === 'node') return declaredRuntime;
		if (startCommand && /^\s*bun(\s+run)?\s+/.test(startCommand)) return 'bun';
		if (startCommand && /^\s*node(\s|$)/.test(startCommand)) return 'node';
		if (pkg?.engines?.bun) return 'bun';
		if (hasBunLockfile) return 'bun';
		return 'node';
	})();

	return {
		name: 'custom',
		runtime,
		packageManager: pm,
		// Sentinel that tells the generic adapter to skip the build step.
		// The user is on the hook for prebuilding before `agentuity deploy`.
		buildCommand: '__agentuity_internal__',
		buildOutput: '.',
		startCommand,
		port: override.runtime?.port,
		confidence: 'low',
	};
}

/**
 * Convert a matched framework definition + project context into a DetectedFramework.
 */
function hasPackage(pkg: PackageJsonData, name: string): boolean {
	return !!pkg.dependencies?.[name] || !!pkg.devDependencies?.[name];
}

function resolveDefaultStartCommand(
	definition: FrameworkDefinition,
	pkg: PackageJsonData
): string | undefined {
	const defaultStart = definition.defaultStartCommand;
	if (!defaultStart) return undefined;
	if (defaultStart.whenPackage && !hasPackage(pkg, defaultStart.whenPackage)) return undefined;
	return defaultStart.command;
}

/**
 * First word of a `start` script that's a clear signal the script is
 * a dev-server invocation, not a production start. These CLIs are
 * almost always devDependencies, so they vanish at runtime when the
 * deploy host runs `npm install --omit=dev` (or the equivalent).
 *
 * When a project's `start` script begins with one of these, we ignore
 * it and fall back to the framework's `defaultStartCommand` (and from
 * there, to the static-file server injector).
 */
const DEV_ONLY_START_BINARIES = new Set([
	'vite',
	'astro',
	'next',
	'nuxt',
	'nuxi',
	'sv',
	'svelte',
	'qwik',
	'nest',
	'mastra',
	'remix',
	'ng',
	'tsx',
	'ts-node',
	'nodemon',
	'turbo',
	'webpack',
	'rollup',
	'parcel',
	'vinxi',
]);

function isLikelyProductionStart(cmd: string | undefined): boolean {
	if (!cmd) return false;
	const first = cmd.trim().split(/\s+/)[0];
	if (!first) return false;
	return !DEV_ONLY_START_BINARIES.has(first);
}

async function frameworkDefToDetected(
	definition: FrameworkDefinition,
	projectDir: string,
	pkg: PackageJsonData
): Promise<DetectedFramework> {
	const pm = await detectPackageManager(projectDir);

	// Use the project's build script if available, otherwise the framework default
	const resolvedBuildCommand = pkg.scripts?.build ?? definition.buildCommand ?? 'npm run build';

	// Resolve output directory — prefer the framework's dynamic resolver
	// (e.g. Angular reads angular.json) over the static default.
	const dynamicOutputDir = definition.resolveOutputDirectory
		? await definition.resolveOutputDirectory(projectDir)
		: null;
	const resolvedOutputDir = dynamicOutputDir ?? definition.outputDirectory ?? '.';

	// Resolve static asset directory (relative to project root):
	// - explicit string: path relative to project root (e.g., '.next/static', '.output/public')
	// - null: the entire output directory is static (SSGs, SPAs) — use outputDirectory
	// - undefined: no static assets known for this framework
	const resolvedStaticDir =
		definition.staticDir === null
			? resolvedOutputDir // null means entire output IS the static dir
			: (definition.staticDir ?? undefined);

	// Resolve the start command.
	//
	// Default precedence is: project's `start` script wins, falling back
	// to the framework's `defaultStartCommand`. This honors production
	// setups that document their launch in `package.json` (e.g. TanStack
	// Start with the Nitro plugin, Hono with `@hono/node-server`).
	//
	// Two exceptions flip that precedence:
	//   1. `definition.preferDefaultStart` — when the framework explicitly
	//      says its scaffolded `start` is a dev-server alias (Nest,
	//      Mastra) and the production command lives in `defaultStartCommand`.
	//   2. The user's `start` invokes a known dev-only CLI (`vite`, `nest`,
	//      `astro`, ...). These binaries are devDependencies; running
	//      them at runtime fails with `command not found` once `--omit=dev`
	//      strips them. Fall back to the framework default (which may be
	//      undefined — in that case the generic adapter injects the
	//      static-file server).
	const userStart = pkg.scripts?.start;
	const frameworkDefault = resolveDefaultStartCommand(definition, pkg);
	const userStartIsProduction = isLikelyProductionStart(userStart);
	const resolvedStartCommand =
		definition.preferDefaultStart && frameworkDefault
			? frameworkDefault
			: userStartIsProduction
				? userStart
				: frameworkDefault;

	// Pick the runtime based on, in order:
	//  1. The actual `start` script: `bun ...` / `bun run ...` =
	//     bun. Anything else (`next start`, `node ...`, etc.) = node.
	//     This is the most reliable signal — it's literally what the
	//     user wrote.
	//  2. `engines.bun` in package.json (declarative preference).
	//  3. A `bun.lock` / `bun.lockb` lockfile in the project root.
	//     We don't fall back to the package-manager DEFAULT here:
	//     `detectPackageManager` returns `'bun'` when no lockfile is
	//     present, which would mis-classify a freshly-scaffolded
	//     Next.js project as bun. We only count the lockfile as a
	//     bun signal when it actually exists.
	//  4. Default to node.
	//
	// The runtime name flows into `launch.json.runtime.name`, which
	// pilot uses for memory tuning (BUN_JSC_forceRAMSize vs
	// NODE_OPTIONS=--max-old-space-size).
	const hasBunLockfile =
		(await pathExists(join(projectDir, 'bun.lockb'))) ||
		(await pathExists(join(projectDir, 'bun.lock')));
	const runtime: 'bun' | 'node' = (() => {
		if (resolvedStartCommand && /^\s*bun(\s+run)?\s+/.test(resolvedStartCommand)) {
			return 'bun';
		}
		if (pkg.engines?.bun) return 'bun';
		if (hasBunLockfile) return 'bun';
		return 'node';
	})();

	return {
		name: definition.slug,
		runtime,
		packageManager: pm,
		buildCommand: resolvedBuildCommand,
		buildOutput: resolvedOutputDir,
		staticDir: resolvedStaticDir,
		typegenCommand: definition.typegenCommand,
		runtimeDependencies: definition.runtimeDependencies,
		buildPreinstallDevDependencies: definition.buildPreinstallDevDependencies,
		buildFileReplacements: definition.buildFileReplacements,
		startCommand: resolvedStartCommand,
		confidence: 'high',
	};
}

/**
 * Detect the framework used by a project.
 *
 * @param projectDir - Absolute path to the project root
 * @returns DetectedFramework or null if nothing could be detected
 */
function bareStaticHtmlDetected(): DetectedFramework {
	return {
		name: 'static-html',
		runtime: 'node',
		packageManager: 'npm',
		buildCommand: '__agentuity_internal__',
		buildOutput: '.',
		staticDir: '.',
		startCommand: 'npx serve',
		port: 3000,
		confidence: 'low',
	};
}

async function detectBareStaticHtml(projectDir: string): Promise<DetectedFramework | null> {
	if (!(await pathExists(join(projectDir, 'index.html')))) return null;
	return bareStaticHtmlDetected();
}

/**
 * Canonical error message for "no deployable project here." Centralised
 * so adding a new supported entrypoint (e.g. a Python project) only
 * requires updating one string instead of hunting down every caller's
 * copy. Used by build, deploy, discover, and project-reconcile error
 * paths. If you add a new entrypoint, update this string and the
 * `detectBareStaticHtml`-style checks in lockstep.
 */
export const NO_DEPLOYABLE_PROJECT_MESSAGE =
	'Could not detect a deployable project. Expected a package.json with a build script (e.g. "build": "next build"), or a bare index.html for static HTML deploys.';

export async function detectFramework(projectDir: string): Promise<DetectedFramework | null> {
	const pkg = await readPackageJson(projectDir);
	if (!pkg) {
		return (await detectCustomLauncher(projectDir, null)) ?? detectBareStaticHtml(projectDir);
	}

	// 1. Run through the framework database
	const match = await detectFromDatabase(projectDir, pkg, frameworkDefinitions);
	if (match) {
		return frameworkDefToDetected(match, projectDir, pkg);
	}

	// 2. Generic fallback
	const generic = await genericDetector.detect(projectDir, pkg);
	if (generic) return generic;

	// 3. Custom-launcher fallback: user shipped their own launch.json.
	return detectCustomLauncher(projectDir, pkg);
}

/**
 * Detect the framework, but also return the parsed package.json for reuse.
 */
export async function detectFrameworkWithPackageJson(
	projectDir: string
): Promise<{ framework: DetectedFramework | null; packageJson: PackageJsonData | null }> {
	const pkg = await readPackageJson(projectDir);
	if (!pkg) {
		const custom = await detectCustomLauncher(projectDir, null);
		if (custom) return { framework: custom, packageJson: null };
		return { framework: await detectBareStaticHtml(projectDir), packageJson: null };
	}

	// 1. Run through the framework database
	const match = await detectFromDatabase(projectDir, pkg, frameworkDefinitions);
	if (match) {
		const framework = await frameworkDefToDetected(match, projectDir, pkg);
		return { framework, packageJson: pkg };
	}

	// 2. Generic fallback
	const generic = await genericDetector.detect(projectDir, pkg);
	if (generic) return { framework: generic, packageJson: pkg };

	// 3. Custom-launcher fallback: user shipped their own launch.json.
	const custom = await detectCustomLauncher(projectDir, pkg);
	return { framework: custom, packageJson: pkg };
}

// Re-export types
export type {
	DetectedFramework,
	FrameworkName,
	PackageJsonData,
	PackageManager,
	RuntimeName,
} from './types.ts';
