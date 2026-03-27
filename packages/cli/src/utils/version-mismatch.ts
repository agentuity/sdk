/**
 * Version mismatch detection for @agentuity/* packages.
 *
 * Detects when a project uses outdated v1 SDK packages while the CLI is v2,
 * and recommends running the migration tool.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVersion } from '../version';
import type { Logger } from '../types';

export interface VersionInfo {
	name: string;
	version: string;
	major: number;
}

export interface VersionMismatchResult {
	/** CLI major version */
	cliMajor: number;
	/** All @agentuity/* packages found */
	packages: VersionInfo[];
	/** Packages with major version mismatch */
	mismatched: VersionInfo[];
	/** Packages that are v1 when CLI is v2+ */
	outdated: VersionInfo[];
	/** Whether any v1 packages were found */
	hasV1Packages: boolean;
	/** Whether there are major version mismatches across packages */
	hasMajorMismatches: boolean;
}

/**
 * Extract major version from semver string
 */
function extractMajor(version: string): number {
	// Handle ranges like ^1.0.0, ~2.0.0, >=1.0.0
	const match = version.match(/(\d+)\.\d+\.\d+/);
	if (match?.[1]) {
		return parseInt(match[1], 10);
	}
	// Handle "latest" or "*"
	if (version === 'latest' || version === '*') {
		return 0; // Unknown major
	}
	return 0;
}

/**
 * Get installed version from node_modules
 */
function getInstalledVersion(projectDir: string, packageName: string): string | null {
	try {
		const pkgPath = join(projectDir, 'node_modules', packageName, 'package.json');
		if (!existsSync(pkgPath)) {
			return null;
		}
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
		return pkg.version || null;
	} catch {
		return null;
	}
}

/**
 * Detect version mismatches in @agentuity/* packages.
 *
 * @param projectDir - Root directory of the user's project
 * @param logger - Logger instance
 * @returns Version mismatch detection result
 */
export function detectVersionMismatch(projectDir: string, logger: Logger): VersionMismatchResult {
	const cliVersion = getVersion();
	const cliMajor = extractMajor(cliVersion);

	const result: VersionMismatchResult = {
		cliMajor,
		packages: [],
		mismatched: [],
		outdated: [],
		hasV1Packages: false,
		hasMajorMismatches: false,
	};

	// Skip check for canary versions
	if (cliVersion.includes('-')) {
		logger.debug('Skipping version mismatch check for canary version: %s', cliVersion);
		return result;
	}

	// Read package.json
	const packageJsonPath = join(projectDir, 'package.json');
	if (!existsSync(packageJsonPath)) {
		logger.debug('No package.json found, skipping version mismatch check');
		return result;
	}

	let packageJson: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	try {
		packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
	} catch (error) {
		logger.debug('Failed to read package.json: %s', error);
		return result;
	}

	// Collect all @agentuity/* packages
	const allDeps = {
		...packageJson.dependencies,
		...packageJson.devDependencies,
	};

	const agentuitPackages = Object.entries(allDeps)
		.filter(([name]) => name.startsWith('@agentuity/'))
		.map(([name, specifier]) => ({ name, specifier }));

	if (agentuitPackages.length === 0) {
		logger.debug('No @agentuity/* packages found in package.json');
		return result;
	}

	// Check each package's installed version
	for (const { name } of agentuitPackages) {
		const installedVersion = getInstalledVersion(projectDir, name);
		if (!installedVersion) {
			logger.debug('%s: not installed, skipping', name);
			continue;
		}

		const major = extractMajor(installedVersion);
		const info: VersionInfo = {
			name,
			version: installedVersion,
			major,
		};

		result.packages.push(info);

		// Check if this is a v1 package when CLI is v2+
		if (major === 1 && cliMajor >= 2) {
			result.outdated.push(info);
			result.hasV1Packages = true;
		}
	}

	// Check for major version mismatches across installed packages
	if (result.packages.length > 1) {
		const majors = new Set(result.packages.map((p) => p.major));
		if (majors.size > 1) {
			result.hasMajorMismatches = true;
			// Find packages that don't match the most common major version
			const majorCounts = new Map<number, number>();
			for (const pkg of result.packages) {
				majorCounts.set(pkg.major, (majorCounts.get(pkg.major) || 0) + 1);
			}
			const mostCommonMajor =
				[...majorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || cliMajor;

			for (const pkg of result.packages) {
				if (pkg.major !== mostCommonMajor) {
					result.mismatched.push(pkg);
				}
			}
		}
	}

	return result;
}

/**
 * Format a warning message for version mismatches.
 */
export function formatVersionMismatchWarning(result: VersionMismatchResult): string {
	const lines: string[] = [];

	if (result.hasV1Packages) {
		lines.push('You are using Agentuity SDK v1 packages, but v2 is now available.');
		lines.push('');
		lines.push('  Outdated packages:');
		for (const pkg of result.outdated) {
			lines.push(`    • ${pkg.name}@${pkg.version}`);
		}
		lines.push('');
		lines.push('  → Run `npx @agentuity/migrate` to upgrade your project to v2.');
		lines.push('    This will automatically update your code and dependencies.');
		lines.push('');
		lines.push('  See the migration guide: https://docs.agentuity.com/migration/v1-to-v2');
	} else if (result.hasMajorMismatches) {
		lines.push('Your project has mismatched major versions across @agentuity/* packages.');
		lines.push('');
		lines.push('  Packages:');
		for (const pkg of result.packages) {
			const marker = result.mismatched.includes(pkg) ? ' ⚠️' : '';
			lines.push(`    • ${pkg.name}@${pkg.version} (v${pkg.major})${marker}`);
		}
		lines.push('');
		lines.push('  → Run `bun install` to sync versions, or pin to the same major version.');
	}

	return lines.join('\n');
}
