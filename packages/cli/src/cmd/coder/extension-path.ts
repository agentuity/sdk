import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathExists } from '../../node-compat/fs.ts';

export type ExtensionPathResolverOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	moduleUrl?: string;
};

export async function resolveExtensionPath(
	flagPath?: string,
	options: ExtensionPathResolverOptions = {}
): Promise<string | null> {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const moduleUrl = options.moduleUrl ?? import.meta.url;

	// 1. Explicit flag
	if (flagPath) {
		return resolve(cwd, flagPath);
	}

	// 2. Env var
	const envPath = env.AGENTUITY_CODER_EXTENSION;
	if (envPath) {
		return resolve(cwd, envPath);
	}

	// 3. Bundled with CLI package (require.resolve)
	try {
		const cliDir = fileURLToPath(new URL('.', moduleUrl));
		const entryPath = require.resolve('@agentuity/coder-tui', { paths: [cliDir] });
		let dir = dirname(entryPath);
		while (dir !== dirname(dir)) {
			if (await pathExists(resolve(dir, 'package.json'))) return dir;
			dir = dirname(dir);
		}
	} catch {
		// require.resolve may fail in workspace/worktree setups — fall through to direct lookup
	}

	// 4. Direct node_modules lookup (workspace symlink fallback)
	try {
		const cliDir = fileURLToPath(new URL('.', moduleUrl));
		// Walk up from this file to the CLI package root, then check node_modules
		let dir = cliDir;
		for (let i = 0; i < 10; i++) {
			const candidate = resolve(dir, 'node_modules', '@agentuity', 'coder-tui');
			if (await pathExists(resolve(candidate, 'package.json'))) return candidate;
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	} catch {
		// ignore
	}

	return null;
}

export async function resolveExtensionRuntimeModulePath(
	extensionPath: string
): Promise<string | null> {
	const sourceModulePath = resolve(extensionPath, 'src', 'remote-tui.ts');
	if (await pathExists(sourceModulePath)) return sourceModulePath;

	const distModulePath = resolve(extensionPath, 'dist', 'remote-tui.js');
	if (await pathExists(distModulePath)) return distModulePath;

	return null;
}
