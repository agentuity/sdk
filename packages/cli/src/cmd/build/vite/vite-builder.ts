/**
 * Vite Builder
 *
 * Utilities for running Vite builds (client, server, workbench)
 */

import { build as viteBuild, type InlineConfig } from 'vite';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
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
				projectId: projectId || '',
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

	// For client/workbench, use inline config (no agentuity plugin needed)
	let viteConfig: InlineConfig;

	if (mode === 'client') {
		// Vite needs index.html as entry point for web apps
		const htmlPath = join(rootDir, 'src', 'web', 'index.html');

		// Use workbench config passed from runAllBuilds
		const { workbenchEnabled = false, workbenchRoute = '/workbench' } = options;

		// Load custom user plugins from agentuity.config.ts if it exists
		const plugins = [react(), browserEnvPlugin(), patchPlugin({ logger, dev })];
		const configPath = join(rootDir, 'agentuity.config.ts');
		if (await Bun.file(configPath).exists()) {
			try {
				const config = await import(configPath);
				const userPlugins = config.default?.plugins || [];
				plugins.push(...userPlugins);
				logger.debug('Loaded %d custom plugin(s) from agentuity.config.ts', userPlugins.length);
			} catch (error) {
				logger.warn('Failed to load agentuity.config.ts:', error);
			}
		}

		viteConfig = {
			root: join(rootDir, 'src', 'web'), // Set web dir as root
			plugins,
			envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_', 'PUBLIC_'],
			publicDir: join(rootDir, 'src', 'web', 'public'),
			define: {
				// Set workbench path if enabled (use import.meta.env for client code)
				'import.meta.env.AGENTUITY_PUBLIC_WORKBENCH_PATH': workbenchEnabled
					? JSON.stringify(workbenchRoute)
					: JSON.stringify(undefined),
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

		viteConfig = {
			root: join(rootDir, '.agentuity/workbench-src'), // Use generated workbench source
			base, // All workbench assets are under the configured route
			plugins: [react(), patchPlugin({ logger, dev })],
			envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_', 'PUBLIC_'],
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

/**
 * Run all builds in sequence: client -> workbench (if enabled) -> server
 */
export async function runAllBuilds(options: Omit<ViteBuildOptions, 'mode'>): Promise<void> {
	const { rootDir, projectId = '', dev = false, logger } = options;

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
		logger.info('Building client assets...');
		try {
			await runViteBuild({
				...options,
				mode: 'client',
				workbenchEnabled: workbenchConfig.enabled,
				workbenchRoute: workbenchConfig.route,
			});
		} catch (error) {
			logger.error('Client build failed:', error);
			throw error;
		}
	} else {
		logger.debug('Skipping client build - no src/web/index.html found');
	}

	// 2. Build workbench (if enabled in config)
	if (workbenchConfig.enabled) {
		logger.info('Building workbench assets...');
		await runViteBuild({
			...options,
			mode: 'workbench',
			workbenchRoute: workbenchConfig.route,
			workbenchEnabled: true,
		});
	}

	// 3. Build server
	logger.info('Building server...');
	try {
		await runViteBuild({ ...options, mode: 'server' });
	} catch (error) {
		logger.error('Server build failed:', error);
		throw error;
	}

	logger.info('All builds complete');
}
