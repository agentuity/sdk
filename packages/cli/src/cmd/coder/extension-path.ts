import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

	// 3. Bundled with CLI package
	try {
		const cliDir = fileURLToPath(new URL('.', moduleUrl));
		const entryPath = require.resolve('@agentuity/coder', { paths: [cliDir] });
		return dirname(entryPath);
	} catch {
		return null;
	}
}

export async function resolveExtensionRuntimeModulePath(
	extensionPath: string
): Promise<string | null> {
	const sourceModulePath = resolve(extensionPath, 'src', 'remote-tui.ts');
	if (await Bun.file(sourceModulePath).exists()) return sourceModulePath;

	const distModulePath = resolve(extensionPath, 'dist', 'remote-tui.js');
	if (await Bun.file(distModulePath).exists()) return distModulePath;

	return null;
}
