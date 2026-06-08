#!/usr/bin/env bun
/**
 * Post-build asset copy.
 *
 * `tsc --build` only emits the JS / DTS output; it does not copy
 * non-TypeScript siblings. The CLI uses the framework scaffolding
 * templates under `src/cmd/project/templates/`, which need to be
 * mirrored into the dist output.
 *
 * Note: this script does NOT touch `bin/agentuity`, `bin/agentuity.cmd`,
 * or `bin/cli.js`. Those are hand-written launcher/shim files; they ship
 * directly from the repo to the published tarball, no compilation required.
 */

import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

/**
 * Directory trees we need to mirror to dist/. The framework
 * scaffolding code resolves these at runtime via the relative path
 * walker in `src/cmd/project/frameworks.ts`.
 */
const DIR_ASSETS = ['src/cmd/project/templates'];

for (const rel of DIR_ASSETS) {
	const src = join(pkgRoot, rel);
	const dst = join(pkgRoot, 'dist', rel.replace(/^src\//, ''));
	await mkdir(dirname(dst), { recursive: true });
	await cp(src, dst, { recursive: true });
	console.log(`✓ copied ${rel}/ -> dist/${rel.replace(/^src\//, '')}/`);
}
