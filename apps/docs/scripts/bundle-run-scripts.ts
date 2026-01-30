/**
 * Bundle all run scripts into standalone JS files using Bun.build().
 *
 * Each script is built as a self-contained ESM file with all dependencies inlined,
 * so the snapshot only needs dist/run/*.js — no node_modules required.
 *
 * Usage: bun run scripts/bundle-run-scripts.ts
 */
import { resolve, basename } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RUN_DIR = resolve(ROOT, 'src/run');
const OUT_DIR = resolve(ROOT, 'dist/run');

// Discover all .ts run scripts, excluding invoke.ts (has dynamic imports, not in SCRIPT_NAMES)
const entrypoints: string[] = [];
const glob = new Bun.Glob('*.ts');
for await (const file of glob.scan({ cwd: RUN_DIR })) {
	if (file === 'invoke.ts') continue;
	entrypoints.push(resolve(RUN_DIR, file));
}

if (entrypoints.length === 0) {
	console.error('No run scripts found in src/run/');
	process.exit(1);
}

console.log(`Bundling ${entrypoints.length} run scripts...`);

const result = await Bun.build({
	entrypoints,
	outdir: OUT_DIR,
	root: RUN_DIR,
	target: 'bun',
	format: 'esm',
	splitting: false,
	minify: false,
	sourcemap: 'none',
});

if (!result.success) {
	console.error('Build failed:');
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

console.log(`Built ${result.outputs.length} scripts to dist/run/:`);
for (const output of result.outputs) {
	const size = (output.size / 1024).toFixed(1);
	console.log(`  ${basename(output.path)} (${size} KB)`);
}
