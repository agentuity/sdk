#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Determine the dist-tag based on create-agentuity version
// Must match the logic in scripts/publish.ts:
// - Beta versions (-beta.) → use @beta
// - Other prereleases (-alpha., -rc., etc.) → use @next
// - Stable versions → use @latest
function getDistTag(version) {
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

const distTag = getDistTag(pkg.version);
const args = process.argv.slice(2);
const result = spawnSync('bunx', [`@agentuity/cli@${distTag}`, 'create', ...args], {
	stdio: 'inherit',
});
process.exit(result.status || 0);
