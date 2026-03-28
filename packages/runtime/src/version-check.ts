/**
 * Version consistency check for @agentuity/* packages.
 *
 * Logs a warning if there are mismatched major versions across SDK packages
 * at runtime startup. This helps developers catch version conflicts early.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Logger } from './logger';
import { isV1Package, showDeprecationWarning } from '@agentuity/core';

// Create a require function for resolving module paths
const require = createRequire(import.meta.url);

/**
 * Known @agentuity/* packages that should have consistent versions.
 */
const KNOWN_PACKAGES = [
	'@agentuity/core',
	'@agentuity/runtime',
	'@agentuity/server',
	'@agentuity/frontend',
	'@agentuity/react',
	'@agentuity/schema',
	'@agentuity/auth',
	'@agentuity/postgres',
	'@agentuity/drizzle',
	'@agentuity/evals',
	'@agentuity/workbench',
	'@agentuity/queue',
	'@agentuity/webhook',
	'@agentuity/schedule',
	'@agentuity/task',
	'@agentuity/keyvalue',
	'@agentuity/vector',
	'@agentuity/stream',
];

interface PackageVersion {
	name: string;
	version: string;
	major: number;
}

/**
 * Extract major version from semver string.
 */
function extractMajor(version: string): number {
	const match = version.match(/^(\d+)\.\d+\.\d+/);
	return match && match[1] ? parseInt(match[1], 10) : 0;
}

/**
 * Get version of a package by resolving its package.json path
 * and reading it directly with fs.readFileSync.
 *
 * This avoids require(package.json) which can crash Bun's JSON parser.
 */
function getPackageVersion(packageName: string): string | null {
	try {
		// Use require.resolve to find the package.json location
		// This doesn't import the file, just resolves the path
		const pkgPath = require.resolve(`${packageName}/package.json`);

		// Read and parse manually - this avoids Bun's JSON import parser
		const content = readFileSync(pkgPath, 'utf-8');
		const pkgJson = JSON.parse(content);
		return pkgJson?.version || null;
	} catch {
		return null;
	}
}

/**
 * Check for version consistency across @agentuity/* packages.
 *
 * @param logger - Logger instance to use for warnings
 */
export function checkVersionConsistency(logger: Logger): void {
	// Skip in development if flag is set (for testing)
	if (process.env.AGENTUITY_SKIP_VERSION_CHECK === 'true') {
		return;
	}

	// Show deprecation warning for v1 packages
	showDeprecationWarning(logger);

	// Collect versions of loaded packages
	const versions: PackageVersion[] = [];

	for (const name of KNOWN_PACKAGES) {
		const version = getPackageVersion(name);
		if (version) {
			versions.push({
				name,
				version,
				major: extractMajor(version),
			});
		}
	}

	// Need at least 2 packages to check consistency
	if (versions.length < 2) {
		return;
	}

	// Check for major version mismatches
	const majors = new Set(versions.map((v) => v.major));
	if (majors.size <= 1) {
		return; // All packages have the same major version
	}

	// Find the most common major version
	const majorCounts = new Map<number, number>();
	for (const v of versions) {
		majorCounts.set(v.major, (majorCounts.get(v.major) || 0) + 1);
	}
	const sortedMajors = [...majorCounts.entries()].sort((a, b) => b[1] - a[1]);
	const expectedMajor = sortedMajors[0]?.[0] ?? 2;

	// Find mismatched packages
	const mismatched = versions.filter((v) => v.major !== expectedMajor);

	if (mismatched.length === 0) {
		return;
	}

	// Log warning
	const mismatchedList = mismatched.map((v) => `${v.name}@${v.version}`).join('\n    ');

	logger.warn(
		'Version mismatch detected: Some @agentuity/* packages have different major versions.\n' +
			'    This may cause unexpected behavior.\n' +
			'\n' +
			'    Expected: v' +
			expectedMajor +
			'\n' +
			'    Mismatched:\n' +
			'    ' +
			mismatchedList +
			'\n' +
			'\n' +
			'    Run `bun install` to sync versions, or pin all @agentuity/* packages\n' +
			'    to the same major version in your package.json.'
	);
}

/**
 * Check if the project is using v1 SDK packages.
 *
 * @returns true if any v1 packages are detected
 */
export function hasV1Packages(): boolean {
	return isV1Package();
}
