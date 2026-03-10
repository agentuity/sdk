/**
 * Vite Builder
 *
 * Utilities for running Vite builds (client, server, workbench)
 */

import { join } from 'node:path';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { InlineConfig, Plugin } from 'vite';
import type { Logger, DeployOptions } from '../../../types';
import { browserEnvPlugin } from './browser-env-plugin';
import { beaconPlugin } from './beacon-plugin';
import { publicAssetPathPlugin } from './public-asset-path-plugin';
import type { BuildReportCollector } from '../../../build-report';

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
	/** Whether analytics is enabled (for beacon injection in client build) */
	analyticsEnabled?: boolean;
	logger: Logger;
	deploymentOptions?: DeployOptions;
	/** Deployment config from agentuity.json (resources, mode, dependencies, domains) */
	deploymentConfig?: Record<string, unknown>;
	/** Optional collector for structured error reporting */
	collector?: BuildReportCollector;
	/** Optional config profile name (e.g., 'staging', 'test') for .env.{profile} files */
	profile?: string;
}

/**
 * Run a Vite build for the specified mode
 * Uses inline Vite config (customizable via agentuity.config.ts)
 */
export async function runViteBuild(options: ViteBuildOptions): Promise<void> {
	const {
		rootDir,
		mode,
		dev = false,
		projectId = '',
		deploymentId = '',
		logger,
		profile,
	} = options;

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

		// Generate environment types from local .env files
		const { generateEnvTypes } = await import('./env-types-generator');
		await generateEnvTypes({
			rootDir,
			srcDir,
			logger,
			isProduction: !dev,
			profile,
		});

		// Load workbench config for entry file generation
		const { loadAgentuityConfig, getWorkbenchConfig } = await import('./config-loader');
		const config = await loadAgentuityConfig(rootDir, logger);
		const workbenchConfig = getWorkbenchConfig(config, dev);

		// Then, generate the entry file
		const { generateEntryFile } = await import('../entry-generator');
		await generateEntryFile({
			rootDir,
			projectId,
			deploymentId: deploymentId || '',
			logger,
			mode: dev ? 'dev' : 'prod',
			workbench: workbenchConfig.configured ? workbenchConfig : undefined,
			analytics: config?.analytics,
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
	// Try project's node_modules first (for custom vite configs), fall back to CLI's
	const projectRequire = createRequire(join(rootDir, 'package.json'));
	let vitePath = 'vite';
	let reactPluginPath = '@vitejs/plugin-react';
	try {
		vitePath = projectRequire.resolve('vite');
		reactPluginPath = projectRequire.resolve('@vitejs/plugin-react');
	} catch {
		// Project doesn't have vite, use CLI's bundled version
	}
	const { build: viteBuild } = await import(vitePath);
	const reactModule = await import(reactPluginPath);
	const react = reactModule.default;

	// For client/workbench, use inline config (no agentuity plugin needed)
	let viteConfig: InlineConfig;

	if (mode === 'client') {
		// Vite needs index.html as entry point for web apps
		const htmlPath = join(rootDir, 'src', 'web', 'index.html');

		// Use workbench config passed from runAllBuilds
		const {
			workbenchEnabled = false,
			workbenchRoute = '/workbench',
			analyticsEnabled = false,
		} = options;

		// Determine CDN base URL for production builds
		// Use CDN for all non-dev builds with a deploymentId (including local region)
		const isLocalRegion = options.region === 'local';
		const cdnDomain = isLocalRegion
			? 'localstack-static-assets.t3.storageapi.dev'
			: 'cdn.agentuity.com';
		const cdnBaseUrl =
			!dev && deploymentId ? `https://${cdnDomain}/${deploymentId}/client/` : undefined;

		// Load custom user plugins from agentuity.config.ts if it exists
		const clientOutDir = join(rootDir, '.agentuity/client');
		const { loadAgentuityConfig, hasFrameworkPlugin } = await import('./config-loader');
		const userConfig = await loadAgentuityConfig(rootDir, logger);
		const userPlugins = userConfig?.plugins || [];

		// Auto-add React plugin if no framework plugin is present (backwards compatibility)
		if (userPlugins.length === 0 || !hasFrameworkPlugin(userPlugins)) {
			logger.debug(
				'No framework plugin found in agentuity.config.ts plugins, adding React automatically'
			);
			userPlugins.unshift(react());
		}

		if (userPlugins.length > 0) {
			logger.debug('Loaded %d custom plugin(s) from agentuity.config.ts', userPlugins.length);
		}

		const plugins = [
			...userPlugins,
			browserEnvPlugin(),
			// Fix incorrect public asset paths and rewrite to CDN URLs
			publicAssetPathPlugin({ cdnBaseUrl }),
			flattenHtmlOutputPlugin(clientOutDir),
			// Emit analytics beacon as hashed CDN asset (prod builds only)
			beaconPlugin({ enabled: analyticsEnabled && !dev }),
		];

		// Merge custom define values from user config
		const userDefine = userConfig?.define || {};
		if (Object.keys(userDefine).length > 0) {
			logger.debug(
				'Loaded %d custom define(s) from agentuity.config.ts',
				Object.keys(userDefine).length
			);
		}

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
				// Copy public files to output for CDN upload (production builds only)
				// In dev mode, Vite serves them directly from src/web/public/
				copyPublicDir: !dev,
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
	static: { included: boolean; duration: number; routes: number };
}

/**
 * Run all builds in sequence: client -> workbench (if enabled) -> server
 */
export async function runAllBuilds(options: Omit<ViteBuildOptions, 'mode'>): Promise<BuildResult> {
	const { rootDir, projectId = '', dev = false, logger, collector } = options;

	if (!dev) {
		rmSync(join(rootDir, '.agentuity'), { force: true, recursive: true });
	}

	const result: BuildResult = {
		workbench: { included: false, duration: 0 },
		client: { included: false, duration: 0 },
		server: { included: false, duration: 0 },
		static: { included: false, duration: 0, routes: 0 },
	};

	// Load config to check if workbench is enabled (dev mode only)
	const { loadAgentuityConfig, getWorkbenchConfig } = await import('./config-loader');
	const config = await loadAgentuityConfig(rootDir, logger);

	// Copy bundle files if configured (before build so build output takes priority)
	if (config?.bundle?.length) {
		const { copyBundleFiles } = await import('./bundle-files');
		const outDir = join(rootDir, '.agentuity');
		const count = await copyBundleFiles(rootDir, outDir, config.bundle, logger);
		if (count > 0) {
			logger.debug(`Copied ${count} bundle file(s) to .agentuity`);
		}
	}

	const workbenchConfig = getWorkbenchConfig(config, dev);
	// Generate workbench files BEFORE any builds if enabled (dev mode only)
	if (workbenchConfig.enabled) {
		logger.debug('Workbench enabled (dev mode), generating files before build...');
		const { generateWorkbenchFiles } = await import('./workbench-generator');
		await generateWorkbenchFiles(rootDir, projectId, workbenchConfig, logger);
	}

	// 1. Discover agents and routes BEFORE builds
	logger.debug('Discovering agents and routes...');
	const { generateAgentRegistry } = await import('./registry-generator');
	const { discoverAgents } = await import('./agent-discovery');
	const { discoverRoutes } = await import('./route-discovery');

	const srcDir = join(rootDir, 'src');
	const agentMetadata = await discoverAgents(
		srcDir,
		projectId,
		options.deploymentId || '',
		logger
	);
	const { routes } = await discoverRoutes(srcDir, projectId, options.deploymentId || '', logger);

	// Generate agent registry for type augmentation BEFORE builds
	// (TypeScript needs these files to exist during type checking)
	generateAgentRegistry(srcDir, agentMetadata);
	logger.debug('Agent registry generated');

	// Check if web frontend exists
	const hasWebFrontend = await Bun.file(join(rootDir, 'src', 'web', 'index.html')).exists();

	// Check if analytics is enabled
	const analyticsEnabled = config?.analytics !== false;

	// 2. Build client (only if web frontend exists)
	if (hasWebFrontend) {
		logger.debug('Building client assets...');
		const endClientDiagnostic = collector?.startDiagnostic('client-build');
		const started = Date.now();
		await runViteBuild({
			...options,
			mode: 'client',
			workbenchEnabled: workbenchConfig.enabled,
			workbenchRoute: workbenchConfig.route,
			analyticsEnabled,
		});
		result.client.included = true;
		result.client.duration = Date.now() - started;
		endClientDiagnostic?.();
	} else {
		logger.debug('Skipping client build - no src/web/index.html found');
	}

	// 2b. Static rendering (if configured)
	if (config?.render === 'static' && hasWebFrontend) {
		logger.debug('Running static rendering (pre-rendering all routes)...');
		const endStaticDiagnostic = collector?.startDiagnostic('static-render');
		const { runStaticRender } = await import('./static-renderer');
		const staticResult = await runStaticRender({
			rootDir,
			logger,
			userPlugins: config?.plugins || [],
		});
		result.static.included = true;
		result.static.duration = staticResult.duration;
		result.static.routes = staticResult.routes;
		endStaticDiagnostic?.();
	}

	// 3. Build workbench (if enabled in config)
	if (workbenchConfig.enabled) {
		logger.debug('Building workbench assets...');
		const endWorkbenchDiagnostic = collector?.startDiagnostic('workbench-build');
		const started = Date.now();
		await runViteBuild({
			...options,
			mode: 'workbench',
			workbenchRoute: workbenchConfig.route,
			workbenchEnabled: true,
		});
		result.workbench.included = true;
		result.workbench.duration = Date.now() - started;
		endWorkbenchDiagnostic?.();
	}

	// 4. Build server
	logger.debug('Building server...');
	const endServerDiagnostic = collector?.startDiagnostic('server-build');
	const serverStarted = Date.now();
	await runViteBuild({ ...options, mode: 'server' });
	result.server.included = true;
	result.server.duration = Date.now() - serverStarted;
	endServerDiagnostic?.();

	// 5. Generate metadata (after all builds complete)
	logger.debug('Generating metadata...');
	const endMetadataDiagnostic = collector?.startDiagnostic('metadata-generation');
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
		deploymentOptions: options.deploymentOptions,
		deploymentConfig: options.deploymentConfig,
	});

	writeMetadataFile(rootDir, metadata, dev, logger);
	endMetadataDiagnostic?.();
	logger.debug('Registry and metadata generation complete');

	logger.debug('All builds complete');
	return result;
}
