#!/usr/bin/env bun
/**
 * Post-build asset copy.
 *
 * `tsc --build` only emits the JS / DTS output; it does not copy
 * non-TypeScript siblings. The CLI imports two markdown files at
 * runtime via `readFileSync` (the AI prompt fixtures, see
 * `src/cmd/ai/prompt/{api,web}.md`), so we mirror them into the
 * dist tree at the same relative paths the source resolved them
 * from.
 */

import { chmod, cp, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

/**
 * Bin entries that need the executable bit set so npm wires them
 * up correctly when the package is installed.
 */
const BIN_ENTRIES = ['dist/bin/cli.js'];

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
	const dst = join(pkgRoot, 'dist', rel);
	await mkdir(dirname(dst), { recursive: true });
	await copyFile(src, dst);
	console.log(`✓ copied ${rel} -> dist/${rel}`);
}

for (const rel of DIR_ASSETS) {
	const src = join(pkgRoot, rel);
	const dst = join(pkgRoot, 'dist', rel);
	await mkdir(dirname(dst), { recursive: true });
	await cp(src, dst, { recursive: true });
	console.log(`✓ copied ${rel}/ -> dist/${rel}/`);
}

for (const rel of BIN_ENTRIES) {
	const path = join(pkgRoot, rel);
	await chmod(path, 0o755);
	console.log(`✓ chmod 0755 ${rel}`);
}
