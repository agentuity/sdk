/**
 * Detection utilities shared across framework detectors.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../../../node-compat/fs.ts';
import type { PackageJsonData, PackageManager } from './types.ts';

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
