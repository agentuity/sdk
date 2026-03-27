/**
 * Vite Builder
 *
 * Utilities for running Vite builds (client, server, workbench)
 */

import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import type { InlineConfig } from 'vite';
import type { Logger, DeployOptions } from '../../../types';
import type { BuildReportCollector } from '../../../build-report';

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
	const { rootDir, mode, dev = false, logger, profile } = options;

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

		// Build with Bun.build (app.ts is the entrypoint)
		const { installExternalsAndBuild } = await import('./server-bundler');
		await installExternalsAndBuild({
			rootDir,
			dev,
			logger,
		});
		return;
	}

	// Dynamically import vite for workbench builds
	const { build: viteBuild } = await import('vite');

	// For client/workbench, use inline config with vite.config.ts loading
	let viteConfig: InlineConfig;

	if (mode === 'client') {
		// For client builds, spawn vite as a subprocess.
		// This avoids issues with Bun's module loading that cause problems
		// with certain plugins like @sveltejs/vite-plugin-svelte.
		// The vite.config.ts in the project handles all configuration.
		const buildMode = dev ? 'development' : 'production';
		const clientOutDir = join(rootDir, '.agentuity/client');

		// Ensure vite.config.ts exists (fallback for projects created before v2 template update)
		const viteConfigPath = join(rootDir, 'vite.config.ts');
		if (!existsSync(viteConfigPath)) {
			logger.debug('Generating fallback vite.config.ts');
			const fallbackConfig = `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { join } from 'node:path';

export default defineConfig({
	plugins: [react()],
	root: '.',
	build: {
		rollupOptions: {
			input: join(__dirname, 'src/web/index.html'),
		},
	},
});
`;
			await Bun.write(viteConfigPath, fallbackConfig);
		}

		logger.debug('Spawning vite build for client (subprocess mode)');
		logger.debug('  outDir: %s', clientOutDir);
		logger.debug('  mode: %s', buildMode);

		const viteProcess = Bun.spawn(
			['bun', 'x', 'vite', 'build', '--mode', buildMode, '--outDir', clientOutDir],
			{
				cwd: rootDir,
				stdout: 'inherit',
				stderr: 'inherit',
			}
		);

		const exitCode = await viteProcess.exited;

		if (exitCode !== 0) {
			throw new Error(`Vite build exited with code ${exitCode}`);
		}

		logger.debug('Vite build complete for mode: client');
		return;
	} else if (mode === 'workbench') {
		const { workbenchRoute = '/workbench' } = options;
		// Ensure route ends with / for Vite base
		const base = workbenchRoute.endsWith('/') ? workbenchRoute : `${workbenchRoute}/`;

		// Workbench is built with React (internal UI)
		// Use CLI's bundled React plugin since workbench is our code
		const reactModule = await import('@vitejs/plugin-react');
		const react = reactModule.default;

		viteConfig = {
			root: join(rootDir, '.agentuity/workbench-src'), // Use generated workbench source
			base, // All workbench assets are under the configured route
			plugins: [react()],
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

	// For workbench mode, use programmatic vite build
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

	// Load runtime config from createApp() in app.ts (v2 approach)
	const { getWorkbenchConfig, loadRuntimeConfig } = await import('./config-loader');
	const runtimeConfig = await loadRuntimeConfig(rootDir, logger);

	const workbenchConfig = getWorkbenchConfig(dev, runtimeConfig);
	// Generate workbench files BEFORE any builds if enabled (dev mode only)
	if (workbenchConfig.enabled) {
		logger.debug('Workbench enabled (dev mode), generating files before build...');
		const { generateWorkbenchFiles } = await import('./workbench-generator');
		await generateWorkbenchFiles(rootDir, projectId, workbenchConfig, logger);
	}

	// 1. Discover agents and routes BEFORE builds
	logger.debug('Discovering agents and routes...');
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

	// Agent metadata is used for metadata.json generation (no registry codegen needed)

	// Check if web frontend exists
	const hasWebFrontend = await Bun.file(join(rootDir, 'src', 'web', 'index.html')).exists();

	// Check if analytics is enabled
	// v2: analytics config comes from createApp()
	const analyticsFromRuntime = runtimeConfig?.analytics;
	const analyticsEnabled =
		analyticsFromRuntime !== undefined ? analyticsFromRuntime !== false : true;

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

		// Normalize index.html location: vite may output to src/web/index.html
		// depending on the project's vite.config.ts configuration
		const clientDir = join(rootDir, '.agentuity/client');
		const nestedIndexHtml = join(clientDir, 'src/web/index.html');
		const rootIndexHtml = join(clientDir, 'index.html');
		if (existsSync(nestedIndexHtml) && !existsSync(rootIndexHtml)) {
			const { renameSync, mkdirSync: mkdirSyncFs } = await import('node:fs');
			// Ensure target directory exists
			mkdirSyncFs(clientDir, { recursive: true });
			renameSync(nestedIndexHtml, rootIndexHtml);
			logger.debug('Moved index.html from src/web/ to client root');
		}

		result.client.included = true;
		result.client.duration = Date.now() - started;
		endClientDiagnostic?.();
	} else {
		logger.debug('Skipping client build - no src/web/index.html found');
	}

	// 2b. Static rendering (if entry-server.tsx exists)
	const entryServerPath = join(rootDir, 'src', 'web', 'entry-server.tsx');
	if (existsSync(entryServerPath) && hasWebFrontend) {
		logger.debug('Running static rendering (pre-rendering all routes)...');
		const endStaticDiagnostic = collector?.startDiagnostic('static-render');
		const { runStaticRender } = await import('./static-renderer');
		const staticResult = await runStaticRender({
			rootDir,
			logger,
			dev,
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
