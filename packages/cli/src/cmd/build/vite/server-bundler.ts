/**
 * Server bundler using Bun.build with external dependency management
 * Handles installing externals into .agentuity/node_modules for production
 */

import { join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { Logger } from '../../../types';
import type { BunPlugin } from 'bun';
import { generatePatches, applyPatch } from '../patch';

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
	logger.debug(`[server-bundler] process.env.NODE_ENV during build: ${process.env.NODE_ENV}`);

	const entryPath = join(rootDir, 'src/generated/app.ts');
	const outDir = join(rootDir, '.agentuity');

	logger.debug(`[server-bundler] Entry: ${entryPath}, OutDir: ${outDir}`);

	// Runtime externals: native modules and packages that need to be external
	// These WILL be installed into .agentuity/node_modules for production
	const runtimeExternals = ['bun', 'fsevents', 'chromium-bidi', 'sharp', 'ws'];

	// Build tool externals: packages that should be external but NOT installed
	// These are devDependencies that may exist in node_modules but aren't needed at runtime
	const buildToolExternals = ['@babel/*', 'lightningcss', '@vitejs/*', 'vite', 'esbuild'];

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
			logger.info('Failed to load agentuity.config.ts for externals:', error);
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

			// Install with Bun (production mode, no scripts, linux target for deployment)
			const proc = Bun.spawn(
				[
					'bun',
					'install',
					'--no-save',
					'--ignore-scripts',
					'--target=bun-linux-x64',
					...externalInstalls,
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
	logger.debug(`[server-bundler] Deleting NODE_ENV before build (was: ${originalNodeEnv})`);
	delete process.env.NODE_ENV;
	logger.debug(`[server-bundler] NODE_ENV after deletion: ${process.env.NODE_ENV}`);

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
		logger.error('Bun.build threw an exception');

		// Handle AggregateError with build/resolve messages
		if (error instanceof AggregateError && error.errors) {
			for (const err of error.errors) {
				const parts = [err.message || err.text || 'Unknown error'];
				if (err.position) {
					parts.push(`  at ${err.position.file}:${err.position.line}:${err.position.column}`);
				}
				logger.error(parts.join('\n'));
			}
		} else {
			logger.error(`  ${error instanceof Error ? error.message : String(error)}`);
		}

		throw error;
	}

	// Restore NODE_ENV after successful build
	if (originalNodeEnv !== undefined) {
		process.env.NODE_ENV = originalNodeEnv;
	}

	if (!result.success) {
		logger.error('Bun.build failed for server');
		logger.error(
			`Build result: success=${result.success}, outputs=${result.outputs.length}, logs=${result.logs.length}`
		);

		const errorMessages = result.logs
			.map((log) => {
				const parts = [log.message];
				if (log.position) {
					parts.push(`  at ${log.position.file}:${log.position.line}:${log.position.column}`);
				}
				return parts.join('\n');
			})
			.join('\n');

		throw new Error(errorMessages || 'Build failed with no error messages');
	}

	logger.debug(`Server build complete: ${result.outputs.length} files`);
}
