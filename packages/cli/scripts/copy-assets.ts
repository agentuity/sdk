#!/usr/bin/env bun
/**
 * Post-build asset copy.
 *
 * `tsc --build` only emits the JS / DTS output; it does not copy
 * non-TypeScript siblings. The CLI imports two markdown files at
 * runtime via `readFileSync` (the AI prompt fixtures, see
 * `src/cmd/ai/prompt/{api,web}.md`), and uses the framework
 * scaffolding templates under `src/cmd/project/templates/`. Both
 * trees need to be mirrored into the dist output.
 *
 * Note: this script does NOT touch `bin/cli.js`. That file is a
 * hand-written JavaScript shim with its own shebang; it ships
 * directly from the repo to the published tarball, no compilation
 * required.
 */

import { cp, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

/**
 * Single files we need to mirror to dist/ at the same relative path.
 * The CLI imports these via readFileSync at module load.
 */
const FILE_ASSETS = ['src/cmd/ai/prompt/api.md', 'src/cmd/ai/prompt/web.md'];

/**
 * Directory trees we need to mirror to dist/. The framework
 * scaffolding code resolves these at runtime via the relative path
 * walker in `src/cmd/project/frameworks.ts`.
 */
const DIR_ASSETS = ['src/cmd/project/templates'];

for (const rel of FILE_ASSETS) {
	const src = join(pkgRoot, rel);
	// rootDir is now ./src, so dist mirrors src/* directly under dist/.
	// rel starts with 'src/', strip that prefix when targeting dist.
	const dst = join(pkgRoot, 'dist', rel.replace(/^src\//, ''));
	await mkdir(dirname(dst), { recursive: true });
	await copyFile(src, dst);
	console.log(`✓ copied ${rel} -> dist/${rel.replace(/^src\//, '')}`);
}

for (const rel of DIR_ASSETS) {
	const src = join(pkgRoot, rel);
	const dst = join(pkgRoot, 'dist', rel.replace(/^src\//, ''));
	await mkdir(dirname(dst), { recursive: true });
	await cp(src, dst, { recursive: true });
	console.log(`✓ copied ${rel}/ -> dist/${rel.replace(/^src\//, '')}/`);
}
