/**
 * Centralized version and package information.
 *
 * Reads `package.json` from disk at module load (once) so it works
 * under all our run configurations:
 *
 *   - `bun packages/cli/src/main.ts` (dev): reads
 *     `packages/cli/package.json` from the source tree.
 *   - `node packages/cli/dist/src/main.js` or installed
 *     `agentuity` (production): reads
 *     `<install-root>/package.json` from the published tarball.
 *
 * Both layouts have `package.json` two directories above this file
 * (`src/version.ts` -> `..` is the package root; from `dist/src/`
 * `..` is `dist/` which doesn't have `package.json`, so we walk one
 * more up from compiled output via the `dist/` parent).
 *
 * The simplest way to reach it from either location is to walk up
 * until we find a file named `package.json`. We bound the walk at 5
 * levels to fail fast if something is wrong.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitSha } from './node-compat/runtime-info.ts';

interface PackageJson {
	name?: string;
	version?: string;
}

function findPackageJson(): PackageJson {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 5; i++) {
		const candidate = join(dir, 'package.json');
		try {
			const stat = statSync(candidate);
			if (stat.isFile()) {
				return JSON.parse(readFileSync(candidate, 'utf-8')) as PackageJson;
			}
		} catch {
			// try parent
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return {};
}

let cachedPackage: PackageJson | null = null;

export function getPackage(): PackageJson {
	if (!cachedPackage) {
		cachedPackage = findPackageJson();
	}
	return cachedPackage;
}

export function getVersion(): string {
	return getPackage().version || 'dev';
}

export function getPackageName(): string {
	return getPackage().name || '@agentuity/cli';
}

export function getRevision(): string {
	return gitSha();
}

const GITHUB_REPO_URL = 'https://github.com/agentuity/sdk';

/**
 * Normalize a version string to a Git tag format (with 'v' prefix)
 */
export function toTag(version: string): string {
	return version.startsWith('v') ? version : `v${version}`;
}

/**
 * Get the GitHub URL for comparing two versions
 * @param fromVersion - The current/old version
 * @param toVersion - The new/target version
 * @returns GitHub compare URL
 */
export function getCompareUrl(fromVersion: string, toVersion: string): string {
	return `${GITHUB_REPO_URL}/compare/${toTag(fromVersion)}...${toTag(toVersion)}`;
}

/**
 * Get the GitHub URL for a specific release
 * @param version - The version to get the release URL for
 * @returns GitHub release URL
 */
export function getReleaseUrl(version: string): string {
	return `${GITHUB_REPO_URL}/releases/tag/${toTag(version)}`;
}
