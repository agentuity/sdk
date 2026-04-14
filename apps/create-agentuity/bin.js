#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

/**
 * Derive the npm dist-tag from the create-agentuity version.
 *
 * Since create-agentuity and @agentuity/cli are published in lockstep
 * under the same dist-tag, we use the prerelease identifier to determine
 * which tag to install from:
 *
 *   bun create agentuity@^3.0.0-alpha.0  → @agentuity/cli@alpha
 *   bun create agentuity@^2.0.0-beta.1   → @agentuity/cli@beta
 *   bun create agentuity@^2.0.0-rc.2     → @agentuity/cli@rc
 *   bun create agentuity                  → @agentuity/cli@latest
 *   bun create agentuity@2.0.2           → @agentuity/cli@2.0.2 (exact)
 *
 * For stable versions (no prerelease), we use the exact version number
 * so that `bun create agentuity@2.0.2` pins to that specific CLI version.
 *
 * @param {string} version - The create-agentuity package version
 * @returns {string} Version specifier for @agentuity/cli (e.g. "2.0.2", "alpha", "beta")
 */
export function getCliVersionSpecifier(version) {
	// Prerelease: extract the tag from the prerelease identifier
	const match = version.match(/-([a-zA-Z]+)/);
	if (match) {
		return match[1].toLowerCase();
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
