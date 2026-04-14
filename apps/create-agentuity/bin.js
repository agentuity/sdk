#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

/**
 * Derive the @agentuity/cli version specifier from the create-agentuity version.
 *
 * Since create-agentuity and @agentuity/cli are published in lockstep with
 * identical version numbers, we use the exact version to ensure compatibility.
 *
 * This matters when users pin a specific version, e.g.:
 *   bun create agentuity@^1.0.0   → should use @agentuity/cli@1.0.x, not @latest
 *   bun create agentuity@2.0.0    → should use @agentuity/cli@2.0.0
 *   bun create agentuity           → uses @latest create-agentuity, gets @latest CLI
 *
 * Prerelease versions use their dist-tag instead:
 * - Beta versions (-beta.) → @beta
 * - Other prereleases (-alpha., -rc., etc.) → @next
 *
 * @param {string} version - The create-agentuity package version
 * @returns {string} Version specifier for @agentuity/cli (e.g. "2.0.2", "beta", "next")
 */
export function getCliVersionSpecifier(version) {
	// Check for beta prerelease first
	if (/-beta\./.test(version)) {
		return 'beta';
	}
	// Check for alpha prerelease
	if (/-alpha\./.test(version)) {
		return 'alpha';
	}
	// Check for other prerelease identifiers: rc, canary, next, etc.
	if (/-([a-zA-Z]+)/.test(version)) {
		return 'next';
	}
	// Stable versions: use the exact version to ensure major version compatibility
	return version;
}

// Only run when executed directly, not when imported for testing.
// When bunx runs this script, it creates a symlink (e.g. ~/.bun/bin/create-agentuity)
// pointing to the real file. process.argv[1] is the symlink path while import.meta.url
// resolves to the real path, so we must resolve symlinks before comparing.
function checkIsMain() {
	const scriptPath = fileURLToPath(import.meta.url);
	if (typeof Bun !== 'undefined') {
		return Bun.main === scriptPath;
	}
	try {
		return realpathSync(process.argv[1]) === scriptPath;
	} catch {
		return process.argv[1] === scriptPath;
	}
}

const isMain = checkIsMain();

if (isMain) {
	const cliVersion = getCliVersionSpecifier(pkg.version);
	const args = process.argv.slice(2);
	const result = spawnSync('bunx', [`@agentuity/cli@${cliVersion}`, 'create', ...args], {
		stdio: 'inherit',
	});
	process.exit(result.status || 0);
}
