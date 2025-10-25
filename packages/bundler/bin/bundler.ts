#!/usr/bin/env bun
import { build } from '../src/bundler';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

function showHelp() {
	console.log(`
Agentuity Bun Bundler
Usage: bundler [options]

Options:
  --dir <path>       Root directory of the project (required)
  --dev              Enable development mode (optional)
  --help             Show this help message
`);
	process.exit(0);
}

const options: { rootDir?: string; dev?: boolean } = {};

for (let i = 0; i < args.length; i++) {
	const arg = args[i];

	if (arg === '--help' || arg === '-h') {
		showHelp();
	}

	if (arg === '--dir') {
		options.rootDir = resolve(args[++i]);
	} else if (arg === '--dev') {
		options.dev = true;
	}
}

if (!options.rootDir) {
	console.error('Error: --dir is required');
	showHelp();
}

try {
	await build({
		rootDir: options.rootDir!,
		dev: options.dev ?? false,
	});
	console.log('Build completed successfully');
} catch (error) {
	console.error('Build failed:', error);
	process.exit(1);
}
