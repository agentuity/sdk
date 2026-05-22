/**
 * Bundle all run scripts into standalone JS files using Bun.build().
 *
 * Each script is built as a self-contained ESM file with all dependencies inlined,
 * so the snapshot only needs dist/run/*.js — no node_modules required.
 *
 * Usage: bun run scripts/bundle-run-scripts.ts
 */
import { basename, resolve } from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const RUN_DIR = resolve(ROOT, 'src/run');
const OUT_DIR = resolve(ROOT, 'dist/run');
const BUILD_METADATA_PATH = resolve(ROOT, '.agentuity/agentuity.metadata.json');
const SNAPSHOT_METADATA_PATH = resolve(ROOT, 'agentuity.metadata.json');

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

if (existsSync(BUILD_METADATA_PATH)) {
	copyFileSync(BUILD_METADATA_PATH, SNAPSHOT_METADATA_PATH);
	console.log(`Copied build metadata to ${basename(SNAPSHOT_METADATA_PATH)}`);
} else {
	console.warn(
		`Warning: build metadata not found at ${BUILD_METADATA_PATH}. ` +
			'Run `bun run build` before bundling sandbox scripts.'
	);
}
