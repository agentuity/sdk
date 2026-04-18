#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCliVersionSpecifier } from './index.ts';

// Read our own package.json to get the version. dist/bin.js lives alongside
// dist/index.js; the published package.json is one level up from dist/.
const here = dirname(fileURLToPath(import.meta.url));
const pkgJsonPath = resolve(here, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { version: string };

/**
 * Only run when executed directly, not when imported for testing.
 *
 * When bunx runs this script it creates a symlink (e.g.
 * ~/.bun/bin/create-agentuity) pointing to the real file.
 * `process.argv[1]` is the symlink path while `import.meta.url` resolves
 * to the real path, so we must resolve symlinks before comparing.
 */
function checkIsMain(): boolean {
	const scriptPath = fileURLToPath(import.meta.url);
	if (typeof Bun !== 'undefined') {
		return Bun.main === scriptPath;
	}
	try {
		return realpathSync(process.argv[1] ?? '') === scriptPath;
	} catch {
		return process.argv[1] === scriptPath;
	}
}

if (checkIsMain()) {
	const cliVersion = getCliVersionSpecifier(pkg.version);
	const args = process.argv.slice(2);
	const result = spawnSync('bunx', [`@agentuity/cli@${cliVersion}`, 'create', ...args], {
		stdio: 'inherit',
	});
	process.exit(result.status ?? 0);
}
