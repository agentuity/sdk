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
	return getPackage().version || 'dev';
}

export function getPackageName(): string {
	return getPackage().name || '@agentuity/cli';
}

export function getRevision(): string {
	// Bun provides git SHA via Bun.revision
	return typeof Bun !== 'undefined' && Bun.revision ? Bun.revision.substring(0, 8) : 'unknown';
}
