import type { Plugin } from 'vite';
import { join } from 'node:path';
import { createLogger } from '@agentuity/server';
import type { LogLevel, DeployOptions } from '../../../types';
import { discoverAgents, type AgentMetadata } from './agent-discovery';
import { discoverRoutes, type RouteMetadata } from './route-discovery';
import { generateAgentRegistry } from './registry-generator';
import { generateLifecycleTypes } from './lifecycle-generator';
import { generateEnvTypes } from './env-types-generator';
import { generateMetadata, writeMetadataFile, generateRouteMapping } from './metadata-generator';
import { generateEntryFile } from '../entry-generator';
import { loadAgentuityConfig, getWorkbenchConfig } from './config-loader';

// Re-export plugins
export { browserEnvPlugin } from './browser-env-plugin';
export { publicAssetPathPlugin } from './public-asset-path-plugin';

export interface AgentuityPluginOptions {
	dev?: boolean;
	rootDir: string;
	projectId?: string;
	orgId?: string;
	deploymentId?: string;
	logLevel?: LogLevel;
	deploymentOptions?: DeployOptions;
	/** Deployment config from agentuity.json (resources, mode, dependencies, domains) */
	deploymentConfig?: Record<string, unknown>;
	/** Optional config profile name (e.g., 'staging', 'test') for .env.{profile} files */
	profile?: string;
}

/**
 * Agentuity Vite Plugin
 *
 * Responsibilities:
 * - Agent discovery via READ-ONLY AST analysis
 * - Route discovery via READ-ONLY AST analysis
 * - Registry generation (src/generated/registry.ts)
 * - Lifecycle types generation (src/generated/lifecycle.d.ts)
 * - Entry file generation (src/generated/app.ts)
 * - Virtual modules (virtual:agentuity/agents, virtual:agentuity/routes)
 * - Metadata generation (agentuity.metadata.json)
 */
export function agentuityPlugin(options: AgentuityPluginOptions): Plugin {
	const {
		dev = false,
		rootDir,
		projectId = '',
		orgId = '',
		deploymentId = '',
		logLevel = 'info',
		deploymentOptions,
		deploymentConfig,
		profile,
	} = options;
	const logger = createLogger(logLevel);
	const srcDir = join(rootDir, 'src');

	// Store discovered metadata
	let agents: AgentMetadata[] = [];
	let routes: RouteMetadata[] = [];

	logger.trace('Initializing Agentuity Vite plugin', { dev, rootDir, projectId, deploymentId });

	return {
		name: 'agentuity',

		/**
		 * Discovery phase - runs at build start
		 * READ-ONLY AST analysis to discover agents and routes
		 */
		async buildStart() {
			logger.trace('buildStart: Discovering agents and routes');

			// Load agentuity.config.ts for entry file generation
			const config = await loadAgentuityConfig(rootDir, logger);
			const workbenchConfig = getWorkbenchConfig(config, dev);

			// Note: Workbench files are generated in runAllBuilds() BEFORE builds start (dev mode only)
			// We just need the config here for entry file generation

			// Discover agents (read-only)
			agents = await discoverAgents(srcDir, projectId, deploymentId, logger);

			// Discover routes (read-only)
			const routeDiscovery = await discoverRoutes(srcDir, projectId, deploymentId, logger);
			routes = routeDiscovery.routes;

			// Generate agent registry
			if (agents.length > 0) {
				generateAgentRegistry(srcDir, agents);
				logger.trace('Generated agent registry with %d agent(s)', agents.length);
			}

			// Generate lifecycle types
			logger.debug('[vite-plugin] About to call generateLifecycleTypes');
			const lifecycleResult = await generateLifecycleTypes(rootDir, srcDir, logger);
			logger.debug(`[vite-plugin] generateLifecycleTypes returned: ${lifecycleResult}`);

			// Generate environment types from local .env files
			logger.debug('[vite-plugin] About to call generateEnvTypes');
			const envTypesResult = await generateEnvTypes({
				rootDir,
				srcDir,
				logger,
				isProduction: !dev,
				profile,
			});
			logger.debug(`[vite-plugin] generateEnvTypes returned: ${envTypesResult}`);

			// Generate entry file (pass workbench and analytics config)
			await generateEntryFile({
				rootDir,
				projectId,
				deploymentId,
				logger,
				mode: dev ? 'dev' : 'prod',
				workbench: workbenchConfig.configured ? workbenchConfig : undefined,
				analytics: config?.analytics,
			});

			logger.trace('buildStart: Discovery complete');
		},

		/**
		 * Virtual module resolution
		 * Provides virtual:agentuity/agents and virtual:agentuity/routes
		 */
		resolveId(id) {
			if (id === 'virtual:agentuity/agents') {
				return '\0virtual:agentuity/agents';
			}
			return null;
		},

		/**
		 * Load virtual modules
		 * Returns code for virtual modules
		 */
		load(id) {
			if (id === '\0virtual:agentuity/agents') {
				// Re-export from generated registry
				return `export { agentRegistry } from '../src/generated/registry.js';`;
			}
			return null;
		},

		/**
		 * Write metadata after bundle is complete
		 */
		async writeBundle() {
			logger.trace('writeBundle: Writing agentuity.metadata.json');

			// Generate metadata from discovered agents and routes
			const metadata = await generateMetadata({
				rootDir,
				projectId,
				orgId,
				deploymentId,
				agents,
				routes,
				dev,
				logger,
				deploymentOptions,
				deploymentConfig,
			});

			// Write metadata file
			writeMetadataFile(rootDir, metadata, dev, logger);

			// Generate route mapping file
			generateRouteMapping(rootDir, routes, dev, logger);

			logger.trace('writeBundle: Complete');
		},
	};
}
