import type { Plugin } from 'vite';
import { join } from 'node:path';
import { createLogger } from '@agentuity/server';
import type { LogLevel } from '../../../types';
import { discoverAgents, type AgentMetadata } from './agent-discovery';
import { discoverRoutes, type RouteMetadata, type RouteInfo } from './route-discovery';
import { generateAgentRegistry, generateRouteRegistry } from './registry-generator';
import { generateLifecycleTypes } from './lifecycle-generator';
import { generateMetadata, writeMetadataFile, generateRouteMapping } from './metadata-generator';
import { generateEntryFile } from '../entry-generator';
import { loadAgentuityConfig, getWorkbenchConfig } from './config-loader';

// Re-export plugins
export { patchPlugin } from './patch-plugin';
export { browserEnvPlugin } from './browser-env-plugin';

export interface AgentuityPluginOptions {
	dev?: boolean;
	rootDir: string;
	projectId?: string;
	orgId?: string;
	deploymentId?: string;
	logLevel?: LogLevel;
}

/**
 * Agentuity Vite Plugin
 *
 * Responsibilities:
 * - Agent discovery via READ-ONLY AST analysis
 * - Route discovery via READ-ONLY AST analysis
 * - Registry generation (.agentuity/registry.generated.ts)
 * - Lifecycle types generation (.agentuity/lifecycle.generated.d.ts)
 * - Entry file generation (.agentuity/agentuity_app.generated.ts)
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
	} = options;
	const logger = createLogger(logLevel);
	const srcDir = join(rootDir, 'src');

	// Store discovered metadata
	let agents: AgentMetadata[] = [];
	let routes: RouteMetadata[] = [];
	let routeInfoList: RouteInfo[] = [];

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
			routeInfoList = routeDiscovery.routeInfoList;

			// Generate registries
			if (agents.length > 0) {
				generateAgentRegistry(srcDir, agents);
				logger.trace('Generated agent registry with %d agent(s)', agents.length);
			}

			if (routeInfoList.length > 0) {
				generateRouteRegistry(srcDir, routeInfoList);
				logger.trace('Generated route registry with %d route(s)', routeInfoList.length);
			}

			// Generate lifecycle types
			await generateLifecycleTypes(rootDir, srcDir, logger);

			// Generate entry file (pass workbench config for route mounting)
			await generateEntryFile({
				rootDir,
				projectId,
				deploymentId,
				logger,
				mode: dev ? 'dev' : 'prod',
				workbench: workbenchConfig.enabled ? workbenchConfig : undefined,
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
			if (id === 'virtual:agentuity/routes') {
				return '\0virtual:agentuity/routes';
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
				return `export { agentRegistry } from '../.agentuity/registry.generated.js';`;
			}
			if (id === '\0virtual:agentuity/routes') {
				// Re-export from generated route registry
				return `export { routeRegistry } from '../.agentuity/routes.generated.js';`;
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
			});

			// Write metadata file
			writeMetadataFile(rootDir, metadata, dev, logger);

			// Generate route mapping file
			generateRouteMapping(rootDir, routes, dev, logger);

			logger.trace('writeBundle: Complete');
		},
	};
}
