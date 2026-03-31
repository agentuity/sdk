import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODER_PACKAGE_NAME = '@agentuity/coder';

type PackageJsonShape = {
	name?: string;
};

type ReadJsonFn = <T>(path: string) => Promise<T>;
type ResolvePackageEntryFn = (specifier: string, fromDir: string) => Promise<string>;
type FileExistsFn = (path: string) => Promise<boolean>;

export type ExtensionPathResolverOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	moduleUrl?: string;
	fileExists?: FileExistsFn;
	readJson?: ReadJsonFn;
	resolvePackageEntry?: ResolvePackageEntryFn;
};

type RuntimeModuleResolverOptions = Pick<ExtensionPathResolverOptions, 'fileExists'>;

async function bunFileExists(path: string): Promise<boolean> {
	return Bun.file(path).exists();
}

async function bunReadJson<T>(path: string): Promise<T> {
	return (await Bun.file(path).json()) as T;
}

async function bunResolvePackageEntry(specifier: string, fromDir: string): Promise<string> {
	return Bun.resolve(specifier, fromDir);
}

async function isExtensionRoot(rootPath: string, fileExists: FileExistsFn): Promise<boolean> {
	const packageJsonPath = join(rootPath, 'package.json');
	if (!(await fileExists(packageJsonPath))) return false;

	return (
		(await fileExists(join(rootPath, 'src', 'index.ts'))) ||
		(await fileExists(join(rootPath, 'dist', 'index.js')))
	);
}

async function findPackageRootFromEntry(
	entryPath: string,
	fileExists: FileExistsFn,
	readJson: ReadJsonFn
): Promise<string | null> {
	let currentDir = dirname(entryPath);

	for (let depth = 0; depth < 5; depth += 1) {
		const packageJsonPath = join(currentDir, 'package.json');
		if (await fileExists(packageJsonPath)) {
			try {
				const packageJson = await readJson<PackageJsonShape>(packageJsonPath);
				if (packageJson?.name === CODER_PACKAGE_NAME) {
					return currentDir;
				}
			} catch {
				// Ignore malformed or inaccessible package.json files while walking up.
			}
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}

	return null;
}

async function resolveCliInstalledExtensionPath(
	moduleUrl: string,
	fileExists: FileExistsFn,
	readJson: ReadJsonFn,
	resolvePackageEntry: ResolvePackageEntryFn
): Promise<string | null> {
	const cliDir = fileURLToPath(new URL('.', moduleUrl));

	try {
		const entryPath = await resolvePackageEntry(CODER_PACKAGE_NAME, cliDir);
		return await findPackageRootFromEntry(entryPath, fileExists, readJson);
	} catch {
		return null;
	}
}

async function resolveSdkMonorepoExtensionPath(
	moduleUrl: string,
	fileExists: FileExistsFn
): Promise<string | null> {
	const cliDir = fileURLToPath(new URL('.', moduleUrl));
	const sdkRoot = resolve(cliDir, '..', '..', '..', '..', '..');
	const coderPath = join(sdkRoot, 'packages', 'coder');
	if (await isExtensionRoot(coderPath, fileExists)) return coderPath;
	return null;
}

export async function resolveExtensionPath(
	flagPath?: string,
	options: ExtensionPathResolverOptions = {}
): Promise<string | null> {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const moduleUrl = options.moduleUrl ?? import.meta.url;
	const fileExists = options.fileExists ?? bunFileExists;
	const readJson = options.readJson ?? bunReadJson;
	const resolvePackageEntry = options.resolvePackageEntry ?? bunResolvePackageEntry;

	// 1. Explicit flag
	if (flagPath) {
		const resolved = resolve(cwd, flagPath);
		if (await isExtensionRoot(resolved, fileExists)) return resolved;
		return null;
	}

	// 2. Env var
	const envPath = env.AGENTUITY_CODER_EXTENSION;
	if (envPath) {
		const resolved = resolve(cwd, envPath);
		if (await isExtensionRoot(resolved, fileExists)) return resolved;
	}

	// 3. Bundled/installed dependency relative to the CLI package itself
	const installedPath = await resolveCliInstalledExtensionPath(
		moduleUrl,
		fileExists,
		readJson,
		resolvePackageEntry
	);
	if (installedPath) return installedPath;

	// 4. Installed npm package in cwd
	const cwdNodeModules = resolve(cwd, 'node_modules', '@agentuity', 'coder');
	if (await isExtensionRoot(cwdNodeModules, fileExists)) return cwdNodeModules;

	// 5. SDK monorepo sibling (for development)
	return resolveSdkMonorepoExtensionPath(moduleUrl, fileExists);
}

export async function resolveExtensionRuntimeModulePath(
	extensionPath: string,
	options: RuntimeModuleResolverOptions = {}
): Promise<string | null> {
	const fileExists = options.fileExists ?? bunFileExists;

	const sourceModulePath = join(extensionPath, 'src', 'remote-tui.ts');
	if (await fileExists(sourceModulePath)) return sourceModulePath;

	const distModulePath = join(extensionPath, 'dist', 'remote-tui.js');
	if (await fileExists(distModulePath)) return distModulePath;

	return null;
}
