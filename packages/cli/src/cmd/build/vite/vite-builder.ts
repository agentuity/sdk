/**
 * Vite Builder
 *
 * Utilities for running Vite builds (client, server, workbench)
 */

import { join } from 'node:path';
import type { InlineConfig } from 'vite';
import type { Logger } from '../../../types';
import { patchPlugin } from './patch-plugin';
import { browserEnvPlugin } from './browser-env-plugin';

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
 * Generates vite config in .agentuity/.vite/ and uses it
 */
export async function runViteBuild(options: ViteBuildOptions): Promise<void> {
	const { rootDir, mode, dev = false, projectId = '', deploymentId = '', logger } = options;

	logger.debug(`Running Vite build for mode: ${mode}`);

	// For server mode, use Bun.build (preserves process.env at runtime)
	if (mode === 'server') {
		try {
			// First, generate the entry file
			const { generateEntryFile } = await import('../entry-generator');
			await generateEntryFile({
				rootDir,
				projectId,
				deploymentId: deploymentId || '',
				logger,
				mode: dev ? 'dev' : 'prod',
			});

			// Then, build with Bun.build
			const { installExternalsAndBuild } = await import('./server-bundler');
			await installExternalsAndBuild({
				rootDir,
				dev,
				logger,
			});
		} catch (error) {
			logger.error('server-bundler import or execution failed:', error);
			throw error;
		}
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
		const plugins = [react(), browserEnvPlugin(), patchPlugin({ logger, dev })];
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
		const isLocalRegion = options.region === 'local';
		const cdnBaseUrl =
			!dev && deploymentId && !isLocalRegion
				? `https://static.agentuity.com/${deploymentId}/client/`
				: undefined;

		viteConfig = {
			root: join(rootDir, 'src', 'web'), // Set web dir as root
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
				outDir: join(rootDir, '.agentuity/client'),
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
			plugins: [react(), patchPlugin({ logger, dev })],
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
	try {
		// Force the build to use the correct mode
		const buildMode = dev ? 'development' : 'production';

		await viteBuild({
			...viteConfig,
			mode: buildMode,
		});

		logger.debug(`Vite build complete for mode: ${mode}`);
	} catch (error) {
		logger.error(`Vite build failed for mode ${mode}:`, error);
		throw error;
	}
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

	// Check if web frontend exists
	const hasWebFrontend = await Bun.file(join(rootDir, 'src', 'web', 'index.html')).exists();

	// 1. Build client (only if web frontend exists)
	if (hasWebFrontend) {
		logger.debug('Building client assets...');
		try {
			const started = Date.now();
			await runViteBuild({
				...options,
				mode: 'client',
				workbenchEnabled: workbenchConfig.enabled,
				workbenchRoute: workbenchConfig.route,
			});
			result.client.included = true;
			result.client.duration = Date.now() - started;
		} catch (error) {
			logger.error('Client build failed:', error);
			throw error;
		}
	} else {
		logger.debug('Skipping client build - no src/web/index.html found');
	}

	// 2. Build workbench (if enabled in config)
	if (workbenchConfig.enabled) {
		logger.debug('Building workbench assets...');
		try {
			const started = Date.now();
			await runViteBuild({
				...options,
				mode: 'workbench',
				workbenchRoute: workbenchConfig.route,
				workbenchEnabled: true,
			});
			result.workbench.included = true;
			result.workbench.duration = Date.now() - started;
		} catch (error) {
			logger.error('Workbench build failed:', error);
			throw error;
		}
	}

	// 3. Build server
	logger.debug('Building server...');
	try {
		const started = Date.now();
		await runViteBuild({ ...options, mode: 'server' });
		result.server.included = true;
		result.server.duration = Date.now() - started;
	} catch (error) {
		logger.error('Server build failed:', error);
		throw error;
	}

	// 4. Generate registry and metadata (after all builds complete)
	logger.debug('Generating agent registry and metadata...');
	const { generateMetadata, writeMetadataFile } = await import('./metadata-generator');
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

	// Generate agent and route registries for type augmentation
	generateAgentRegistry(srcDir, agentMetadata);
	generateRouteRegistry(srcDir, routeInfoList);
	logger.debug('Agent and route registries generated');

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
