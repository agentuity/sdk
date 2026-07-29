/**
 * Detection utilities shared across framework detectors.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../../../node-compat/fs.ts';
import type { PackageJsonData, PackageManager } from './types.ts';

/**
 * Marks a `buildCommand` that adapters must skip entirely — the project
 * is either a bare static-HTML deploy or ships its own prebuilt output
 * via a custom `launch.json`. Not a real command to run.
 */
export const NO_BUILD_SENTINEL = '__agentuity_internal__';

/**
 * Check if a file exists (any of the given names) in a directory.
 * Returns the first matching filename, or null.
 */
export async function findFile(dir: string, names: string[]): Promise<string | null> {
	for (const name of names) {
		if (await pathExists(join(dir, name))) {
			return name;
		}
	}
	return null;
}

/**
 * Check if a dependency exists in package.json (dependencies or devDependencies).
 */
export function hasDependency(pkg: PackageJsonData, name: string): boolean {
	return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

/**
 * Get the version of a dependency from package.json.
 * Returns the version range string, or null if not found.
 */
export function getDependencyVersion(pkg: PackageJsonData, name: string): string | null {
	return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? null;
}

/**
 * Check if any dependency matching a pattern exists.
 */
export function hasDependencyMatching(pkg: PackageJsonData, pattern: RegExp): boolean {
	const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
	return Object.keys(allDeps).some((name) => pattern.test(name));
}

/**
 * Match a shell command that, when executed, would invoke the agentuity
 * CLI itself. We use this to refuse to honor `package.json` scripts that
 * just shell out to `agentuity build` / `agentuity dev` (a leftover from
 * v2 scaffolds) — running them from inside `agentuity build` recurses
 * forever.
 *
 * Recognised forms (case-insensitive on the binary name):
 *
 *   agentuity ...
 *   ./node_modules/.bin/agentuity ...
 *   npx agentuity ... / npx --yes agentuity ... / npx -y agentuity ...
 *   bunx agentuity ... / bun x agentuity ...
 *   pnpm dlx agentuity ... / pnpm exec agentuity ...
 *   yarn agentuity ... / yarn dlx agentuity ...
 *
 * Leading `cross-env FOO=bar` / `FOO=bar` env-var prefixes are stripped
 * before matching so the check survives the usual real-world wrappers.
 */
export function isAgentuityCliInvocation(cmd: string | undefined | null): boolean {
	if (!cmd) return false;
	let rest = cmd.trim();
	// Strip a leading `cross-env` wrapper.
	rest = rest.replace(/^cross-env\s+/i, '');
	// Strip leading `KEY=value` env-var assignments (any number).
	while (/^[A-Z_][A-Z0-9_]*=\S+\s+/i.test(rest)) {
		rest = rest.replace(/^[A-Z_][A-Z0-9_]*=\S+\s+/i, '');
	}
	// Strip a single leading runner prefix that's documented to fall through
	// to its first non-flag arg: npx, bunx, `bun x`, `pnpm dlx`, `pnpm exec`,
	// `yarn dlx`, `yarn`.
	rest = rest.replace(
		/^(?:npx(?:\s+(?:--yes|-y))?|bunx|bun\s+x|pnpm\s+(?:dlx|exec)|yarn(?:\s+dlx)?)\s+/i,
		''
	);
	// Now `rest` should start with the binary name.
	const first = rest.split(/\s+/, 1)[0] ?? '';
	const bin = first.replace(/^\.\/(?:node_modules\/\.bin\/)?/i, '').toLowerCase();
	return bin === 'agentuity';
}

/**
 * Detect which package manager the project uses by checking lockfiles.
 */
export async function detectPackageManager(projectDir: string): Promise<PackageManager> {
	if (await pathExists(join(projectDir, 'bun.lockb'))) return 'bun';
	if (await pathExists(join(projectDir, 'bun.lock'))) return 'bun';
	if (await pathExists(join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
	if (await pathExists(join(projectDir, 'yarn.lock'))) return 'yarn';
	if (await pathExists(join(projectDir, 'package-lock.json'))) return 'npm';

	// Default to bun (our preferred runtime)
	return 'bun';
}

/**
 * Get the run command prefix for a package manager.
 * e.g., 'npm run', 'bun run', 'pnpm run', 'yarn'
 */
export function getRunCommand(pm: PackageManager): string {
	switch (pm) {
		case 'bun':
			return 'bun run';
		case 'npm':
			return 'npm run';
		case 'pnpm':
			return 'pnpm run';
		case 'yarn':
			return 'yarn';
	}
}

/**
 * Get the exec command prefix for a package manager (npx/bunx/etc.).
 */
export function getExecCommand(pm: PackageManager): string {
	switch (pm) {
		case 'bun':
			return 'bunx';
		case 'npm':
			return 'npx';
		case 'pnpm':
			return 'pnpm exec';
		case 'yarn':
			return 'yarn dlx';
	}
}

/**
 * Read and parse package.json from a directory.
 * Returns null if not found or unparseable.
 */
export async function readPackageJson(dir: string): Promise<PackageJsonData | null> {
	const path = join(dir, 'package.json');
	if (!(await pathExists(path))) return null;
	try {
		return JSON.parse(await readFile(path, 'utf-8')) as PackageJsonData;
	} catch {
		return null;
	}
}
