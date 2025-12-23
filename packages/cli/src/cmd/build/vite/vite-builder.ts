/**
 * Vite Builder
 *
 * Utilities for running Vite builds (client, server, workbench)
 */

import { join } from 'node:path';
import { existsSync, renameSync, rmdirSync, rmSync } from 'node:fs';
import type { InlineConfig, Plugin } from 'vite';
import type { Logger } from '../../../types';
import { browserEnvPlugin } from './browser-env-plugin';

/**
 * Vite plugin to flatten the output structure for index.html
 *
 * When root is set to the project root (for TanStack Router compatibility),
 * Vite outputs index.html to .agentuity/client/src/web/index.html instead of
 * .agentuity/client/index.html. This plugin moves it to the expected location.
 */
function flattenHtmlOutputPlugin(outDir: string): Plugin {
	return {
		name: 'agentuity:flatten-html-output',
		apply: 'build',
		closeBundle() {
			const nestedHtmlPath = join(outDir, 'src', 'web', 'index.html');
			const targetHtmlPath = join(outDir, 'index.html');

			if (existsSync(nestedHtmlPath)) {
				renameSync(nestedHtmlPath, targetHtmlPath);

				// Clean up empty src/web directory structure
				const srcWebDir = join(outDir, 'src', 'web');
				const srcDir = join(outDir, 'src');
				try {
					rmSync(srcWebDir, { recursive: true, force: true });
					rmSync(srcDir, { recursive: true, force: true });
				} catch {
					// Ignore cleanup errors
				}
			}
		},
	};
}

export interface ViteBuildOptions {
	rootDir: string;
	mode: 'client' | 'server' | 'workbench';
	dev?: boolean;
	port?: number;
	projectId?: string;
	orgId?: string;
	region?: string;
	deploymentId?: string;
	workbenchRoute?: string;
	workbenchEnabled?: boolean;
	logger: Logger;
}

/**
 * Run a Vite build for the specified mode
 * Uses inline Vite config (customizable via agentuity.config.ts)
 */
export async function runViteBuild(options: ViteBuildOptions): Promise<void> {
	const { rootDir, mode, dev = false, projectId = '', deploymentId = '', logger } = options;

	logger.debug(`Running Vite build for mode: ${mode}`);

	// For server mode, use Bun.build (preserves process.env at runtime)
	if (mode === 'server') {
		const srcDir = join(rootDir, 'src');

		// Generate documentation files (if they don't exist)
		const { generateDocumentation } = await import('./docs-generator');
		await generateDocumentation(srcDir, logger);

		// Generate/update prompt files in dev mode only (non-blocking)
		if (dev) {
			import('./prompt-generator')
				.then(({ generatePromptFiles }) => generatePromptFiles(srcDir, logger))
				.catch((err) => logger.warn('Failed to generate prompt files: %s', err.message));
		}

		// Generate lifecycle types (if setup() exists)
		const { generateLifecycleTypes } = await import('./lifecycle-generator');
		await generateLifecycleTypes(rootDir, srcDir, logger);

		// Then, generate the entry file
		const { generateEntryFile } = await import('../entry-generator');
		await generateEntryFile({
			rootDir,
			projectId,
			deploymentId: deploymentId || '',
			logger,
			mode: dev ? 'dev' : 'prod',
		});

		// Finally, build with Bun.build
		const { installExternalsAndBuild } = await import('./server-bundler');
		await installExternalsAndBuild({
			rootDir,
			dev,
			logger,
		});
		return;
	}

	// Dynamically import vite and react plugin
	const { build: viteBuild } = await import('vite');
	const reactModule = await import('@vitejs/plugin-react');
	const react = reactModule.default;

	// For client/workbench, use inline config (no agentuity plugin needed)
	let viteConfig: InlineConfig;

	if (mode === 'client') {
		// Vite needs index.html as entry point for web apps
		const htmlPath = join(rootDir, 'src', 'web', 'index.html');

		// Use workbench config passed from runAllBuilds
		const { workbenchEnabled = false, workbenchRoute = '/workbench' } = options;

		// Load custom user plugins from agentuity.config.ts if it exists
		const clientOutDir = join(rootDir, '.agentuity/client');
		const plugins = [react(), browserEnvPlugin(), flattenHtmlOutputPlugin(clientOutDir)];
		const { loadAgentuityConfig } = await import('./config-loader');
		const userConfig = await loadAgentuityConfig(rootDir, logger);
		const userPlugins = userConfig?.plugins || [];
		plugins.push(...userPlugins);
		if (userPlugins.length > 0) {
			logger.debug('Loaded %d custom plugin(s) from agentuity.config.ts', userPlugins.length);
		}

		// Merge custom define values from user config
		const userDefine = userConfig?.define || {};
		if (Object.keys(userDefine).length > 0) {
			logger.debug(
				'Loaded %d custom define(s) from agentuity.config.ts',
				Object.keys(userDefine).length
			);
		}

		// Determine CDN base URL for production builds
		// Use CDN for all non-dev builds with a deploymentId (including local region)
		const isLocalRegion = options.region === 'local';
		const cdnDomain = isLocalRegion
			? 'localstack-static-assets.t3.storage.dev'
			: 'static.agentuity.com';
		const cdnBaseUrl =
			!dev && deploymentId ? `https://${cdnDomain}/${deploymentId}/client/` : undefined;

		viteConfig = {
			// Use project root as Vite root so plugins (e.g., TanStack Router) resolve paths
			// from the repo root, matching where agentuity.config.ts is located
			root: rootDir,
			plugins,
			envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_', 'PUBLIC_'],
			publicDir: join(rootDir, 'src', 'web', 'public'),
			base: cdnBaseUrl, // CDN URL for production assets
			define: {
				// Merge user-defined constants first
				...userDefine,
				// Then add default defines (these will override any user-defined protected keys)
				// Set workbench path if enabled (use import.meta.env for client code)
				'import.meta.env.AGENTUITY_PUBLIC_WORKBENCH_PATH': workbenchEnabled
					? JSON.stringify(workbenchRoute)
					: 'undefined',
			},
			build: {
				outDir: clientOutDir,
				rollupOptions: {
					input: htmlPath,
				},
				manifest: true,
				emptyOutDir: true,
				// Disable copying public files - Vite already includes them in assets with hashing
				copyPublicDir: false,
			},
			logLevel: 'warn',
		};
	} else if (mode === 'workbench') {
		const { workbenchRoute = '/workbench' } = options;
		// Ensure route ends with / for Vite base
		const base = workbenchRoute.endsWith('/') ? workbenchRoute : `${workbenchRoute}/`;

		// Load custom user config for define values (same as client mode)
		const { loadAgentuityConfig } = await import('./config-loader');
		const userConfig = await loadAgentuityConfig(rootDir, logger);
		const userDefine = userConfig?.define || {};
		if (Object.keys(userDefine).length > 0) {
			logger.debug(
				'Loaded %d custom define(s) from agentuity.config.ts for workbench',
				Object.keys(userDefine).length
			);
		}

		viteConfig = {
			root: join(rootDir, '.agentuity/workbench-src'), // Use generated workbench source
			base, // All workbench assets are under the configured route
			plugins: [react()],
			envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_', 'PUBLIC_'],
			define: {
				// Merge user-defined constants
				...userDefine,
			},
			build: {
				outDir: join(rootDir, '.agentuity/workbench'),
				rollupOptions: {
					input: join(rootDir, '.agentuity/workbench-src/index.html'),
				},
				manifest: true,
				emptyOutDir: true,
			},
			logLevel: 'warn',
		};
	} else {
		throw new Error(`Unknown build mode: ${mode}`);
	}

	// Build with Vite
	// Force the build to use the correct mode
	const buildMode = dev ? 'development' : 'production';

	await viteBuild({
		...viteConfig,
		mode: buildMode,
	});

	logger.debug(`Vite build complete for mode: ${mode}`);
}

interface BuildResult {
	workbench: { included: boolean; duration: number };
	client: { included: boolean; duration: number };
	server: { included: boolean; duration: number };
}

/**
 * Run all builds in sequence: client -> workbench (if enabled) -> server
 */
export async function runAllBuilds(options: Omit<ViteBuildOptions, 'mode'>): Promise<BuildResult> {
	const { rootDir, projectId = '', dev = false, logger } = options;

	if (!dev) {
		rmSync(join(rootDir, '.agentuity'), { force: true, recursive: true });
	}

	const result: BuildResult = {
		workbench: { included: false, duration: 0 },
		client: { included: false, duration: 0 },
		server: { included: false, duration: 0 },
	};

	// Load config to check if workbench is enabled (dev mode only)
	const { loadAgentuityConfig, getWorkbenchConfig } = await import('./config-loader');
	const config = await loadAgentuityConfig(rootDir, logger);
	const workbenchConfig = getWorkbenchConfig(config, dev);
	// Generate workbench files BEFORE any builds if enabled (dev mode only)
	if (workbenchConfig.enabled) {
		logger.debug('Workbench enabled (dev mode), generating files before build...');
		const { generateWorkbenchFiles } = await import('./workbench-generator');
		await generateWorkbenchFiles(rootDir, projectId, workbenchConfig, logger);
	}

	// 1. Discover agents and routes BEFORE builds
	logger.debug('Discovering agents and routes...');
	const { generateAgentRegistry, generateRouteRegistry } = await import('./registry-generator');
	const { discoverAgents } = await import('./agent-discovery');
	const { discoverRoutes } = await import('./route-discovery');

	const srcDir = join(rootDir, 'src');
	const agentMetadata = await discoverAgents(
		srcDir,
		projectId,
		options.deploymentId || '',
		logger
	);
	const { routes, routeInfoList } = await discoverRoutes(
		srcDir,
		projectId,
		options.deploymentId || '',
		logger
	);

	// Generate agent and route registries for type augmentation BEFORE builds
	// (TypeScript needs these files to exist during type checking)
	generateAgentRegistry(srcDir, agentMetadata);
	generateRouteRegistry(srcDir, routeInfoList);
	logger.debug('Agent and route registries generated');

	// Check if web frontend exists
	const hasWebFrontend = await Bun.file(join(rootDir, 'src', 'web', 'index.html')).exists();

	// 2. Build client (only if web frontend exists)
	if (hasWebFrontend) {
		logger.debug('Building client assets...');
		const started = Date.now();
		await runViteBuild({
			...options,
			mode: 'client',
			workbenchEnabled: workbenchConfig.enabled,
			workbenchRoute: workbenchConfig.route,
		});
		result.client.included = true;
		result.client.duration = Date.now() - started;
	} else {
		logger.debug('Skipping client build - no src/web/index.html found');
	}

	// 3. Build workbench (if enabled in config)
	if (workbenchConfig.enabled) {
		logger.debug('Building workbench assets...');
		const started = Date.now();
		await runViteBuild({
			...options,
			mode: 'workbench',
			workbenchRoute: workbenchConfig.route,
			workbenchEnabled: true,
		});
		result.workbench.included = true;
		result.workbench.duration = Date.now() - started;
	}

	// 4. Build server
	logger.debug('Building server...');
	const serverStarted = Date.now();
	await runViteBuild({ ...options, mode: 'server' });
	result.server.included = true;
	result.server.duration = Date.now() - serverStarted;

	// 5. Generate metadata (after all builds complete)
	logger.debug('Generating metadata...');
	const { generateMetadata, writeMetadataFile } = await import('./metadata-generator');

	// Generate metadata
	const metadata = await generateMetadata({
		rootDir,
		projectId,
		orgId: options.orgId,
		deploymentId: options.deploymentId,
		agents: agentMetadata,
		routes,
		logger,
		dev,
	});

	writeMetadataFile(rootDir, metadata, dev, logger);
	logger.debug('Registry and metadata generation complete');

	logger.debug('All builds complete');
	return result;
}
