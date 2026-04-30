import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../node-compat/fs.ts';
import { run } from '../node-compat/proc.ts';
import type { Logger } from '../types.ts';

export interface PackageRef {
	name: string;
	version: string;
}

/**
 * Mapping from alias key (aliasName@version) to actual package reference.
 * Used to resolve npm aliases (e.g., "tailwind-merge-v2": "npm:tailwind-merge@2.6.0")
 * to their actual package names for accurate malware detection.
 */
export type AliasMap = Map<string, PackageRef>;

export async function extractDependencies(
	projectDir: string,
	logger: Logger
): Promise<PackageRef[]> {
	try {
		logger.debug('Extracting dependencies using bun pm ls --all');

		const result = await run({
			cmd: ['bun', 'pm', 'ls', '--all'],
			cwd: projectDir,
		});

		if (result.exitCode !== 0) {
			logger.warn(
				'Failed to extract dependencies: bun pm ls exited with code %d',
				result.exitCode
			);
			return [];
		}

		const output = result.stdout;
		let packages = parseBunPmLsOutput(output);

		// Load alias map from bun.lock to resolve npm aliases to actual package names
		const aliasMap = await loadAliasMap(projectDir, logger);
		if (aliasMap.size > 0) {
			logger.debug('Loaded %d package aliases from bun.lock', aliasMap.size);
			packages = resolveAliases(packages, aliasMap, logger);
		}

		logger.debug('Extracted %d unique packages', packages.length);
		return packages;
	} catch (error) {
		logger.warn('Failed to extract dependencies: %s', error);
		return [];
	}
}

export function parseBunPmLsOutput(output: string): PackageRef[] {
	const packages = new Map<string, PackageRef>();
	const lines = output.split('\n');

	for (const line of lines) {
		const match = line.match(/([^\s]+)@(\d+\.\d+\.\d+[^\s]*)/);
		if (match) {
			const name = match[1];
			const version = match[2];
			if (name && version) {
				const key = `${name}@${version}`;
				if (!packages.has(key)) {
					packages.set(key, { name, version });
				}
			}
		}
	}

	return Array.from(packages.values());
}

/**
 * Load alias mappings from bun.lock file.
 *
 * The bun.lock file contains a "packages" object where:
 * - Keys are the package names as they appear in node_modules (alias names for aliased packages)
 * - Values are arrays where the first element is "actualPackageName@version"
 *
 * For npm aliases like `"tailwind-merge-v2": "npm:tailwind-merge@2.6.0"`:
 * - Key: "tailwind-merge-v2"
 * - Value[0]: "tailwind-merge@2.6.0"
 *
 * This function builds a map from "aliasName@version" to the actual PackageRef.
 */
export async function loadAliasMap(projectDir: string, logger: Logger): Promise<AliasMap> {
	const aliasMap: AliasMap = new Map();

	try {
		const lockfilePath = join(projectDir, 'bun.lock');

		if (!(await pathExists(lockfilePath))) {
			logger.debug('No bun.lock file found, skipping alias resolution');
			return aliasMap;
		}

		const content = await readFile(lockfilePath, 'utf-8');
		const parsed = parseBunLockFile(content);

		if (!parsed || !parsed.packages) {
			return aliasMap;
		}

		for (const [aliasName, packageInfo] of Object.entries(parsed.packages)) {
			if (!Array.isArray(packageInfo) || packageInfo.length === 0) {
				continue;
			}

			const actualPackageSpec = packageInfo[0];
			if (typeof actualPackageSpec !== 'string') {
				continue;
			}

			// Parse "actualPackageName@version" from the first element
			const atIndex = actualPackageSpec.lastIndexOf('@');
			if (atIndex <= 0) {
				continue;
			}

			const actualName = actualPackageSpec.substring(0, atIndex);
			const actualVersion = actualPackageSpec.substring(atIndex + 1);

			// Only add to alias map if the alias name differs from the actual name
			// This indicates an npm alias (e.g., tailwind-merge-v2 -> tailwind-merge)
			if (aliasName !== actualName) {
				const aliasKey = `${aliasName}@${actualVersion}`;
				aliasMap.set(aliasKey, { name: actualName, version: actualVersion });
			}
		}
	} catch (error) {
		logger.debug('Failed to parse bun.lock for alias resolution: %s', error);
	}

	return aliasMap;
}

/**
 * Parse bun.lock file content.
 *
 * bun.lock uses a relaxed JSON format (JSONC) with trailing commas, which
 * standard JSON.parse cannot handle. We need to strip trailing commas before parsing.
 *
 * Structure:
 * {
 *   "lockfileVersion": 1,
 *   "packages": {
 *     "package-name": ["actual-package@version", "", {}, "sha512-..."],
 *     ...
 *   }
 * }
 */
export function parseBunLockFile(content: string): BunLockFile | null {
	try {
		// bun.lock uses JSONC format with trailing commas - strip them before parsing
		const sanitized = stripTrailingCommas(content);
		return JSON.parse(sanitized) as BunLockFile;
	} catch {
		return null;
	}
}

/**
 * Strip trailing commas from JSONC content to make it valid JSON.
 * Handles trailing commas before ] and } characters.
 */
function stripTrailingCommas(content: string): string {
	// Match comma followed by optional whitespace and then ] or }
	return content.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Represents the structure of a bun.lock file.
 */
export interface BunLockFile {
	lockfileVersion?: number;
	packages?: Record<string, unknown[]>;
}

/**
 * Resolve npm aliases in the package list to their actual package names.
 *
 * This prevents false positives in malware detection where alias names
 * (e.g., "tailwind-merge-v2") are flagged as suspicious when they're
 * actually legitimate aliases for real packages (e.g., "tailwind-merge").
 */
export function resolveAliases(
	packages: PackageRef[],
	aliasMap: AliasMap,
	logger: Logger
): PackageRef[] {
	const resolved = new Map<string, PackageRef>();

	for (const pkg of packages) {
		const aliasKey = `${pkg.name}@${pkg.version}`;
		const actualPkg = aliasMap.get(aliasKey);

		if (actualPkg) {
			logger.debug(
				'Resolved npm alias: %s@%s -> %s@%s',
				pkg.name,
				pkg.version,
				actualPkg.name,
				actualPkg.version
			);
			const resolvedKey = `${actualPkg.name}@${actualPkg.version}`;
			if (!resolved.has(resolvedKey)) {
				resolved.set(resolvedKey, actualPkg);
			}
		} else {
			const key = `${pkg.name}@${pkg.version}`;
			if (!resolved.has(key)) {
				resolved.set(key, pkg);
			}
		}
	}

	return Array.from(resolved.values());
}
