#!/usr/bin/env node
/**
 * Published CLI entry point for `@agentuity/cli`.
 *
 * This file is intentionally tiny:
 *   - npm uses it as the `agentuity` binary (see package.json `bin`).
 *   - The shebang lets the kernel launch Node directly when users run
 *     `agentuity` from a shell on macOS/Linux.
 *   - It hands off to the compiled CLI at `dist/src/main.js`.
 *
 * A small `--version` fast-path runs before the dynamic import so a
 * naked `agentuity --version` doesn't load 90% of the CLI's modules.
 * Anything beyond that is decided inside `src/main.ts`.
 *
 * No build step rewrites this file. It ships as-is from the repo to
 * the published tarball.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length === 1 && ['version', '-v', '--version', '-V'].includes(args[0])) {
	const here = dirname(fileURLToPath(import.meta.url));
	const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8'));
	console.log(pkg.version || 'dev');
	process.exit(0);
}

await import('../dist/main.js');
