#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Determine the dist-tag based on create-agentuity version
// Prerelease versions (e.g., 2.0.0-beta.1) should use @next
// Stable versions should use @latest
function getDistTag(version) {
	// Check for prerelease identifiers: alpha, beta, rc, canary, next, etc.
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
