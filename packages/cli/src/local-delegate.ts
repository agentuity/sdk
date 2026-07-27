/**
 * Global → local CLI delegation.
 *
 * When the CLI is invoked from a **global** install but the current project
 * has its own locally-installed `@agentuity/cli` whose version differs from
 * the running global one, we re-exec the local binary with the same argv and
 * exit with its code.
 *
 * Why: v2 projects pin `@agentuity/cli` in their devDependencies. Once v3
 * becomes the `latest` dist-tag, a v2 user's global `agentuity` would be v3
 * and would mis-handle their v2 project (wrong build, broken deploy). By
 * deferring to the project-local CLI, a v2 user who never upgrades keeps v2
 * behavior even with a v3 binary on their PATH.
 *
 * Scope and guards:
 *   - Only runs when the invoked binary is a global install.
 *   - Only delegates when the local version differs from the global version
 *     (same version → run in-process, no extra spawn).
 *   - Delegates every command except `inspect`. Inspection must use the current
 *     CLI's detector and stay offline, even for legacy projects whose local CLI
 *     would otherwise be installed or invoked before command registration.
 *   - A loop guard env var (`AGENTUITY_DELEGATED`) prevents the local CLI
 *     from delegating again.
 *
 * Self-heal (Feature 3): when a global v3 CLI runs inside a project that has
 * `@agentuity/runtime` but NO `@agentuity/cli` dependency and no local
 * install, we add `@agentuity/cli` to devDependencies (matching the
 * runtime's spec) and install it, then fall through to delegation. This way
 * v2 projects that were created without the CLI dep still get v2 behavior
 * under a v3 global instead of being mis-handled.
 */

import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { run, spawnInherit } from './node-compat/proc.ts';
import * as tui from './tui.ts';
import { getInstallationType } from './utils/installation-type.ts';
import { getVersion } from './version.ts';

/** Env var set on a re-exec'd local CLI so it never delegates again. */
export const LOCAL_DELEGATION_GUARD_ENV = 'AGENTUITY_DELEGATED';
const DELEGATED_ENV = LOCAL_DELEGATION_GUARD_ENV;
const PACKAGE_NAME = '@agentuity/cli';

const GLOBAL_OPTIONS_WITH_VALUES = new Set([
	'--config',
	'--env',
	'--log-level',
	'--org-id',
	'--project-id',
	'--color-scheme',
	'--color',
	'--error-format',
	'--input',
	'--fields',
	'--profile',
]);

/** Return whether the first command operand is `inspect`. */
export function isInspectInvocation(argv: string[]): boolean {
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) continue;
		if (arg === '--') return argv[i + 1] === 'inspect';
		if (GLOBAL_OPTIONS_WITH_VALUES.has(arg)) {
			i++;
			continue;
		}
		if (arg.startsWith('-')) continue;
		return arg === 'inspect';
	}
	return false;
}

export interface LocalCli {
	/** Absolute path to the local CLI's executable (the `bin.agentuity` entry). */
	binPath: string;
	/** Version string from the local package's package.json. */
	version: string;
}

/**
 * Extract the `--dir`/`--dir=` value from argv, if present. Mirrors the
 * helper in main.ts but kept local so delegation has no import cycle.
 */
function dirFromArgs(args: string[]): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		if (arg.startsWith('--dir=')) return arg.slice(6);
		if (arg === '--dir' && i + 1 < args.length) {
			const next = args[i + 1];
			if (next !== undefined && !next.startsWith('-')) return next;
		}
	}
	return undefined;
}

/**
 * Walk up from `startDir` looking for a locally-installed `@agentuity/cli`
 * under `node_modules`. Returns its resolved bin path and version, or null.
 */
export function findLocalCli(startDir: string): LocalCli | null {
	let dir = resolve(startDir);
	// Bound the walk: stop at filesystem root.
	while (true) {
		const pkgDir = join(dir, 'node_modules', '@agentuity', 'cli');
		const pkgJsonPath = join(pkgDir, 'package.json');
		if (existsSync(pkgJsonPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
					version?: string;
					bin?: string | Record<string, string>;
				};
				const version = pkg.version;
				const binEntry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.agentuity;
				if (version && binEntry) {
					const binPath = isAbsolute(binEntry) ? binEntry : join(pkgDir, binEntry);
					if (existsSync(binPath)) {
						return { binPath, version };
					}
				}
			} catch {
				// Unreadable/invalid local package.json — fall through and keep walking.
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * Walk up from `startDir` to the nearest directory containing a
 * `package.json`. Returns null if none is found before the filesystem root.
 */
function findProjectRoot(startDir: string): string | null {
	let dir = resolve(startDir);
	while (true) {
		if (existsSync(join(dir, 'package.json'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * Read `@agentuity/runtime`'s spec from a project's package.json, looking in
 * both `dependencies` and `devDependencies`. Returns the spec string (e.g.
 * `^2.0.0`) or null if the runtime isn't a declared dependency.
 */
function runtimeSpec(pkg: {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}): string | null {
	return (
		pkg.dependencies?.['@agentuity/runtime'] ??
		pkg.devDependencies?.['@agentuity/runtime'] ??
		null
	);
}

/**
 * Self-heal a legacy (v1 or v2) project that has `@agentuity/runtime` but no
 * `@agentuity/cli` dependency: add `@agentuity/cli` (matching the runtime's
 * spec) to devDependencies and install it, so the project-local CLI exists
 * for delegation to defer to.
 *
 * No-op (returns false) when: there's no project root, no runtime dep, a
 * cli dep is already declared, or a local install already exists. Returns
 * true when it installed the local CLI.
 *
 * Legacy projects are Bun-only, so we install with `bun add -D`.
 */
async function ensureLocalCliForV2(projectDir: string): Promise<boolean> {
	const root = findProjectRoot(projectDir);
	if (!root) return false;

	// Already have a local install — nothing to heal; delegation handles it.
	if (findLocalCli(root)) return false;

	const pkgPath = join(root, 'package.json');
	let pkg: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	try {
		pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
	} catch {
		return false;
	}

	const spec = runtimeSpec(pkg);
	if (!spec) return false; // not a legacy-runtime project

	// Only self-heal when the runtime is pinned to a concrete legacy (v1 or v2)
	// range. v3 dropped @agentuity/runtime entirely, so a v1/v2 major is the
	// signal. A floating spec (`latest`, `*`, `workspace:*`, git/url) could
	// resolve the CLI to v3 and defeat the whole point, so we bail and let the
	// global CLI handle it rather than guess.
	if (!/^[\^~]?[12]\./.test(spec)) {
		return false;
	}

	// CLI already declared (any version) — respect the user's choice.
	if (pkg.dependencies?.['@agentuity/cli'] || pkg.devDependencies?.['@agentuity/cli']) {
		return false;
	}

	tui.info(
		`Detected a legacy project (@agentuity/runtime ${spec}) without @agentuity/cli. Adding @agentuity/cli@${spec} so the local CLI handles this project.`
	);

	// `bun add -D` rewrites package.json + installs in one step, matching the
	// runtime's spec. We pass the exact spec so the resolved range mirrors it.
	const result = await run({
		cmd: ['bun', 'add', '-D', `@agentuity/cli@${spec}`],
		cwd: root,
	});
	if (result.exitCode !== 0) {
		tui.warning(
			`Failed to install @agentuity/cli locally (bun exited ${result.exitCode}). Continuing with the global CLI.`
		);
		return false;
	}
	return true;
}

/**
 * If we're a global install sitting on top of a different project-local
 * `@agentuity/cli`, re-exec the local one and exit. Returns without acting
 * (so the caller continues in-process) when delegation doesn't apply.
 *
 * Before delegating, self-heals v2 projects missing the CLI dep (Feature 3):
 * installs a project-local `@agentuity/cli` matching the runtime spec so the
 * subsequent delegation has something to defer to.
 *
 * @param argv - The raw CLI args (without the runtime/script prefix), i.e.
 *               `process.argv.slice(2)`.
 */
export async function maybeDelegateToLocal(argv: string[]): Promise<void> {
	// `inspect` must use this CLI's current detector without installing or
	// invoking a project-local CLI first.
	if (isInspectInvocation(argv)) return;

	// Loop guard: a delegated child must never delegate again.
	if (process.env[DELEGATED_ENV]) return;

	// Only a global install should defer to a project-local one.
	if (getInstallationType() !== 'global') return;

	const projectDir = dirFromArgs(argv) ?? process.cwd();

	// Self-heal v2 projects that have the runtime but no CLI dep, so the
	// delegation below has a local CLI to defer to.
	await ensureLocalCliForV2(projectDir);

	const local = findLocalCli(projectDir);
	if (!local) return;

	// Same version → no point spawning a second process.
	if (local.version === getVersion()) return;

	const { exitCode } = await spawnInherit({
		cmd: [local.binPath, ...argv],
		env: { [DELEGATED_ENV]: '1' },
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const exit = (globalThis as any).AGENTUITY_PROCESS_EXIT || process.exit;
	exit(exitCode ?? 0);
}

export { PACKAGE_NAME as DELEGATE_PACKAGE_NAME };
