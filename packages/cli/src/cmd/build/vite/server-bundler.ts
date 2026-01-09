/**
 * Server bundler using Bun.build with external dependency management
 * Handles installing externals into .agentuity/node_modules for production
 */

import { join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { Logger } from '../../../types';
import type { BunPlugin } from 'bun';
import { generatePatches, applyPatch } from '../patch';

/**
 * Format a Bun build log (BuildMessage or ResolveMessage) into a readable string
 */
export function formatBuildLog(log: BuildMessage | ResolveMessage): string {
	const parts: string[] = [];

	// For ResolveMessage, format with specifier info
	if (log.name === 'ResolveMessage') {
		const resolveLog = log as ResolveMessage;
		if (resolveLog.specifier) {
			parts.push(`Could not resolve "${resolveLog.specifier}"`);
			// Use referrer if available, otherwise fall back to position.file
			const referrer = resolveLog.referrer || resolveLog.position?.file;
			if (referrer) {
				parts.push(`  imported from: ${referrer}`);
			}
		} else if (resolveLog.message) {
			parts.push(resolveLog.message);
		}
	} else if (log.message) {
		parts.push(log.message);
	}

	// Add position info if available (only if we haven't already shown referrer from position)
	if (log.position && log.name !== 'ResolveMessage') {
		parts.push(`  at ${log.position.file}:${log.position.line}:${log.position.column}`);
	}

	return parts.join('\n');
}

export interface ServerBundleOptions {
	rootDir: string;
	dev: boolean;
	logger: Logger;
}

/**
 * Install external dependencies and build server bundle
 * For production: installs externals into .agentuity/node_modules BEFORE bundling
 */
export async function installExternalsAndBuild(options: ServerBundleOptions): Promise<void> {
	const { rootDir, dev, logger } = options;

	logger.debug('[server-bundler] Starting server bundle process');

	const entryPath = join(rootDir, 'src/generated/app.ts');
	const outDir = join(rootDir, '.agentuity');

	logger.debug(`[server-bundler] Entry: ${entryPath}, OutDir: ${outDir}`);

	// Runtime externals: native modules and packages that need to be external
	// These WILL be installed into .agentuity/node_modules for production
	const runtimeExternals = ['bun', 'fsevents', 'chromium-bidi', 'sharp', 'ws'];

	// Build tool externals: packages that should be external but NOT installed
	// These are devDependencies that may exist in node_modules but aren't needed at runtime
	// NOTE: @babel/* is NOT externalized because some runtime deps (e.g., puppeteer → cosmiconfig → parse-json)
	// require @babel/code-frame at runtime. Babel packages are pure JS and bundle fine.
	const buildToolExternals = ['lightningcss', '@vitejs/*', 'vite', 'esbuild'];

	// Load custom externals and define from agentuity.config.ts if it exists
	const customExternals: string[] = [];
	let userDefine: Record<string, string> = {};
	const configPath = join(rootDir, 'agentuity.config.ts');
	if (await Bun.file(configPath).exists()) {
		try {
			const config = await import(configPath);
			const userConfig = config.default;

			// Load custom externals (legacy build.external support)
			if (userConfig?.build?.external && Array.isArray(userConfig.build.external)) {
				customExternals.push(
					...userConfig.build.external.filter((e: unknown) => typeof e === 'string')
				);
			}

			// Load custom define values
			if (userConfig?.define && typeof userConfig.define === 'object') {
				userDefine = userConfig.define;
				if (Object.keys(userDefine).length > 0) {
					logger.debug(
						'Loaded %d custom define(s) from agentuity.config.ts for server bundle',
						Object.keys(userDefine).length
					);
				}
			}
		} catch (error) {
			logger.debug('Failed to load agentuity.config.ts for externals:', error);
		}
	}

	// Combine runtime externals with custom externals for installation
	const installPatterns = [...runtimeExternals, ...customExternals];

	// All external patterns (runtime + build tools + custom) for Bun.build
	const allExternalPatterns = [...runtimeExternals, ...buildToolExternals, ...customExternals];
	let external = allExternalPatterns;

	// For production builds: install ONLY runtime externals, then discover full dependency tree
	if (!dev) {
		logger.debug('Installing externalized packages to discover full dependency tree...');

		// Step 1: Collect packages matching RUNTIME external patterns (skip build tools)
		const externalInstalls: string[] = [];
		for (const pattern of installPatterns) {
			if (pattern.endsWith('/*')) {
				// Pattern like @org/* - install all packages under that scope
				const prefix = pattern.slice(0, -2);
				const nmDir = join(rootDir, 'node_modules', prefix);
				const nmDirExists = await stat(nmDir)
					.then((s) => s.isDirectory())
					.catch(() => false);
				if (nmDirExists) {
					const entries = await readdir(nmDir);
					for (const entry of entries) {
						const pkgName = `${prefix}/${entry}`;
						const pkgJsonExists = await Bun.file(
							join(rootDir, 'node_modules', pkgName, 'package.json')
						).exists();
						if (pkgJsonExists) {
							externalInstalls.push(pkgName);
						}
					}
				}
			} else {
				// Exact package name
				const pkgJsonExists = await Bun.file(
					join(rootDir, 'node_modules', pattern, 'package.json')
				).exists();
				if (pkgJsonExists) {
					externalInstalls.push(pattern);
				}
			}
		}

		// Step 2: Write minimal package.json and install externals
		if (externalInstalls.length > 0) {
			const pkgPath = join(rootDir, 'package.json');
			const pkgContents = await Bun.file(pkgPath).json();

			await Bun.write(
				join(outDir, 'package.json'),
				JSON.stringify({ name: pkgContents.name, version: pkgContents.version }, null, 2)
			);

			logger.debug(
				'Installing %d packages: %s',
				externalInstalls.length,
				externalInstalls.join(', ')
			);

			// Collect platform-specific optional dependencies for native modules
			// Bun's --target flag doesn't correctly install cross-platform optional deps,
			// so we need to explicitly install them (e.g., @img/sharp-linux-x64 for sharp)
			const platformOptionalDeps: string[] = [];
			for (const pkg of externalInstalls) {
				const pkgJsonPath = join(rootDir, 'node_modules', pkg, 'package.json');
				if (await Bun.file(pkgJsonPath).exists()) {
					try {
						const pkgJson = await Bun.file(pkgJsonPath).json();
						if (pkgJson.optionalDependencies) {
							// Find linux-x64 specific optional dependencies (glibc, not musl)
							// Match patterns like: @img/sharp-linux-x64, @img/sharp-libvips-linux-x64
							for (const optDep of Object.keys(pkgJson.optionalDependencies)) {
								if (optDep.includes('linux-x64') && !optDep.includes('musl')) {
									platformOptionalDeps.push(optDep);
								}
							}
						}
					} catch {
						// Ignore parse errors
					}
				}
			}

			if (platformOptionalDeps.length > 0) {
				logger.debug(
					'Found %d platform-specific optional deps: %s',
					platformOptionalDeps.length,
					platformOptionalDeps.join(', ')
				);
			}

			// Use npm with --force for cross-platform installs since Bun's --target flag
			// doesn't correctly handle optional dependencies for other platforms
			const allPackagesToInstall = [...externalInstalls, ...platformOptionalDeps];
			logger.debug('Installing with npm (cross-platform): %s', allPackagesToInstall.join(', '));

			const proc = Bun.spawn(
				[
					'npm',
					'install',
					'--no-save',
					'--ignore-scripts',
					'--os=linux',
					'--cpu=x64',
					'--force',
					...allPackagesToInstall,
				],
				{
					cwd: outDir,
					stdout: 'pipe',
					stderr: 'pipe',
				}
			);

			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				throw new Error(
					`Failed to install external dependencies (exit code ${exitCode}):\n${stderr}`
				);
			}

			// Step 3: Scan what actually got installed (includes transitive dependencies)
			const installedNmDir = join(outDir, 'node_modules');
			const installedNmDirExists = await stat(installedNmDir)
				.then((s) => s.isDirectory())
				.catch(() => false);
			if (installedNmDirExists) {
				const allInstalled: string[] = [];

				// Recursively find all installed packages
				const scanDir = async (dir: string, prefix = '') => {
					const entries = await readdir(dir, { withFileTypes: true });
					for (const entry of entries) {
						if (entry.isDirectory()) {
							const pkgName = prefix ? `${prefix}/${entry.name}` : entry.name;

							// Check if this is a package (has package.json)
							const pkgJsonExists = await Bun.file(
								join(dir, entry.name, 'package.json')
							).exists();
							if (pkgJsonExists) {
								allInstalled.push(pkgName);
							}

							// Recurse into scoped packages (@org/package)
							if (entry.name.startsWith('@')) {
								await scanDir(join(dir, entry.name), entry.name);
							}
						}
					}
				};

				await scanDir(installedNmDir);
				logger.debug(
					'Discovered %d total packages (including transitive deps)',
					allInstalled.length
				);

				// Step 4: Use ALL installed packages + build tool externals for bundling
				external = [...allInstalled, ...buildToolExternals];
			}
		}
	} else {
		// Dev mode: just use all external patterns as-is
		external = allExternalPatterns;
	}

	// Build server bundle
	logger.debug('Building server with Bun.build...');
	logger.debug(`External packages (${external.length}): ${external.join(', ')}`);

	// Create Bun plugin to apply LLM patches during bundling
	const patches = generatePatches();
	logger.debug(`Loaded ${patches.size} patch(es) for LLM providers`);

	const patchPlugin: BunPlugin = {
		name: 'agentuity:patch',
		setup(build) {
			for (const [, patch] of patches) {
				let modulePath = join('node_modules', patch.module, '.*');
				if (patch.filename) {
					modulePath = join('node_modules', patch.module, patch.filename + '.*');
				}
				build.onLoad(
					{
						filter: new RegExp(modulePath),
						namespace: 'file',
					},
					async (args) => {
						if (build.config.target !== 'bun') {
							return;
						}
						logger.trace(`Applying patch to: ${args.path}`);
						const [contents, loader] = await applyPatch(args.path, patch);
						return {
							contents,
							loader,
						};
					}
				);
			}
		},
	};

	const buildConfig = {
		entrypoints: [entryPath],
		outdir: outDir, // Output to .agentuity/ directly (not .agentuity/server/)
		target: 'bun' as const,
		format: 'esm' as const,
		splitting: false, // Disable splitting - causes issues with externalized CommonJS packages
		minify: !dev,
		sourcemap: (dev ? 'inline' : 'external') as 'inline' | 'external',
		external,
		// CRITICAL: Disable environment variable inlining for server builds
		// Server code must read process.env at RUNTIME, not have values baked in at build time
		// Without this, NODE_ENV and other env vars get inlined as string literals
		env: 'disable' as const,
		define: userDefine, // Include custom define values from agentuity.config.ts
		plugins: [patchPlugin],
		naming: {
			entry: 'app.js', // Output as app.js (not app.generated.js)
		},
	};

	logger.debug(
		`Bun.build config: ${JSON.stringify({ ...buildConfig, external: `[${external.length} packages]` }, null, 2)}`
	);

	// WORKAROUND: Temporarily delete NODE_ENV to prevent Bun.build from inlining it
	// See: https://github.com/oven-sh/bun/issues/20183
	// Even with env: 'disable', Bun.build still inlines NODE_ENV at build time
	const originalNodeEnv = process.env.NODE_ENV;
	delete process.env.NODE_ENV;

	// Verify entry point exists before building
	if (!(await Bun.file(entryPath).exists())) {
		throw new Error(`Entry point not found: ${entryPath}`);
	}

	logger.debug(`Entry point verified: ${entryPath}`);

	let result;
	try {
		result = await Bun.build(buildConfig);
	} catch (error: unknown) {
		// Restore NODE_ENV after build attempt
		if (originalNodeEnv !== undefined) {
			process.env.NODE_ENV = originalNodeEnv;
		}

		// Handle AggregateError with build/resolve messages
		if (error instanceof AggregateError && error.errors) {
			const formattedErrors = error.errors
				.map((err) => {
					// Try to use formatBuildLog if it looks like a BuildMessage/ResolveMessage
					if (err && typeof err === 'object' && 'name' in err) {
						const formatted = formatBuildLog(err as BuildMessage | ResolveMessage);
						if (formatted) return formatted;
					}
					// Fallback for other error types
					const parts = [err.message || err.text || 'Unknown error'];
					if (err.position) {
						parts.push(
							`  at ${err.position.file}:${err.position.line}:${err.position.column}`
						);
					}
					return parts.join('\n');
				})
				.filter(Boolean)
				.join('\n');

			throw new Error(formattedErrors || 'Build failed');
		}

		throw error;
	}

	// Restore NODE_ENV after successful build
	if (originalNodeEnv !== undefined) {
		process.env.NODE_ENV = originalNodeEnv;
	}

	if (!result.success) {
		const errorMessages = result.logs
			.map((log) => formatBuildLog(log))
			.filter(Boolean)
			.join('\n');

		throw new Error(errorMessages || 'Build failed with no error messages');
	}

	logger.debug(`Server build complete: ${result.outputs.length} files`);
}
