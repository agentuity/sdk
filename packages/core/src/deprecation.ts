/**
 * Deprecation warning for v1 SDK packages.
 *
 * This module logs a deprecation warning when v1 packages are used,
 * recommending migration to v2.
 *
 * The warning is only shown once per process to avoid noise.
 */

import type { Logger } from './logger.ts';

let deprecationWarningShown = false;

/**
 * Package version info
 */
interface PackageVersion {
	version: string;
	major: number;
}

/**
 * Get version from package.json using various strategies.
 */
function getPackageVersion(): PackageVersion | null {
	try {
		// Try to read from the bundled package.json
		// When bundled by Bun/Vite, import.meta.resolve can find the package.json
		const pkgUrl = import.meta.resolve('@agentuity/core/package.json');
		const pkg = require(pkgUrl);
		if (pkg?.version) {
			const match = pkg.version.match(/^(\d+)\.\d+\.\d+/);
			return {
				version: pkg.version,
				major: match ? parseInt(match[1], 10) : 0,
			};
		}
	} catch {
		// Try require fallback
		try {
			const pkg = require('@agentuity/core/package.json');
			if (pkg?.version) {
				const match = pkg.version.match(/^(\d+)\.\d+\.\d+/);
				return {
					version: pkg.version,
					major: match ? parseInt(match[1], 10) : 0,
				};
			}
		} catch {
			// Ignore
		}
	}
	return null;
}

/**
 * Show deprecation warning for v1 packages.
 *
 * @param logger - Optional logger instance (falls back to console)
 */
export function showDeprecationWarning(logger?: Logger): void {
	// Only show once per process
	if (deprecationWarningShown) {
		return;
	}

	// Skip if explicitly disabled
	if (process.env.AGENTUITY_NO_DEPRECATION_WARNING === 'true') {
		return;
	}

	// Skip in test environments
	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return;
	}

	const pkgVersion = getPackageVersion();

	// Only warn if this is a v1 package
	if (!pkgVersion || pkgVersion.major !== 1) {
		return;
	}

	deprecationWarningShown = true;

	const message =
		'\n' +
		'┌──────────────────────────────────────────────────────────────────────┐\n' +
		'│                                                                      │\n' +
		'│  ⚠️  Agentuity SDK v1 is deprecated                                  │\n' +
		'│                                                                      │\n' +
		'│  You are using @agentuity/core@' +
		pkgVersion.version.padEnd(22) +
		'         │\n' +
		'│                                                                      │\n' +
		'│  v2 introduces major improvements:                                   │\n' +
		'│    • Hono RPC for end-to-end type safety                            │\n' +
		'│    • Vite-native dev server with HMR                                 │\n' +
		'│    • Simplified configuration in createApp()                         │\n' +
		'│                                                                      │\n' +
		'│  → Run `npx @agentuity/migrate` to upgrade your project             │\n' +
		'│                                                                      │\n' +
		'│  Docs: https://docs.agentuity.com/migration/v1-to-v2                │\n' +
		'│                                                                      │\n' +
		'└──────────────────────────────────────────────────────────────────────┘\n';

	if (logger) {
		logger.warn(message);
	} else {
		console.warn(message);
	}
}

/**
 * Check if the current package is v1.
 */
export function isV1Package(): boolean {
	const pkgVersion = getPackageVersion();
	return pkgVersion?.major === 1;
}
