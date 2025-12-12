/**
 * Centralized version and package information
 * Loads package.json once and caches it
 */

import pkg from '../package.json' with { type: 'json' };

// Cache the package data
let cachedPackage: typeof pkg | null = null;

export function getPackage(): typeof pkg {
	if (!cachedPackage) {
		cachedPackage = pkg;
	}
	return cachedPackage;
}

export function getVersion(): string {
	return process.env.AGENTUITY_CLI_VERSION || getPackage().version || 'dev';
}

export function getPackageName(): string {
	return getPackage().name || '@agentuity/cli';
}

export function getRevision(): string {
	// Bun provides git SHA via Bun.revision
	return typeof Bun !== 'undefined' && Bun.revision ? Bun.revision.substring(0, 8) : 'unknown';
}

const GITHUB_REPO_URL = 'https://github.com/agentuity/sdk';

/**
 * Normalize a version string to a Git tag format (with 'v' prefix)
 */
function toTag(version: string): string {
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
