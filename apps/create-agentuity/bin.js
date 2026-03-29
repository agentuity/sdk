#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Determine the dist-tag based on create-agentuity version
// Must match the logic in scripts/publish.ts:
// - Beta versions (-beta.) → use @beta
// - Other prereleases (-alpha., -rc., etc.) → use @next
// - Stable versions → use @latest
export function getDistTag(version) {
	// Check for beta prerelease first
	if (/-beta\./.test(version)) {
		return 'beta';
	}
	// Check for other prerelease identifiers: alpha, rc, canary, next, etc.
	if (/-([a-zA-Z]+)/.test(version)) {
		return 'next';
	}
	return 'latest';
}

// Only run when executed directly, not when imported for testing.
// When bunx runs this script, it creates a symlink (e.g. ~/.bun/bin/create-agentuity)
// pointing to the real file. process.argv[1] is the symlink path while import.meta.url
// resolves to the real path, so we must resolve symlinks before comparing.
function checkIsMain() {
	const scriptPath = new URL(import.meta.url).pathname;
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
	const distTag = getDistTag(pkg.version);
	const args = process.argv.slice(2);
	const result = spawnSync('bunx', [`@agentuity/cli@${distTag}`, 'create', ...args], {
		stdio: 'inherit',
	});
	process.exit(result.status || 0);
}
