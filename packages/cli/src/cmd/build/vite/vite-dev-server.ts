/**
 * Vite Dev Server
 *
 * Runs Vite dev server with HMR for both client and server code
 */

import { createServer, type ViteDevServer } from 'vite';
import type { Logger } from '../../../types';
import { generateViteConfig } from './vite-config-generator';

export interface ViteDevServerOptions {
	rootDir: string;
	port?: number;
	projectId?: string;
	orgId?: string;
	deploymentId?: string;
	logger: Logger;
}

// Minimal interface for subprocess management
interface ProcessLike {
	kill: (signal?: number) => void;
	stdout?: AsyncIterable<Uint8Array>;
	stderr?: AsyncIterable<Uint8Array>;
}

export interface DevServerWithProcess {
	viteServer: ViteDevServer | null;
	appProcess: ProcessLike | null;
}

/**
 * Start Vite dev server with @hono/vite-dev-server middleware
 * This integrates Vite HMR directly into the Hono app
 */
export async function startViteDevServer(
	options: ViteDevServerOptions
): Promise<DevServerWithProcess> {
	const { rootDir, port = 3500, projectId = '', orgId = '', deploymentId = '', logger } = options;

	logger.debug('Starting Vite dev server with HMR...');

	// Generate workbench source files if enabled (dev mode - Vite will serve with HMR)
	const { loadAgentuityConfig, getWorkbenchConfig } = await import('./config-loader');
	const config = await loadAgentuityConfig(rootDir, logger);
	const workbenchConfig = getWorkbenchConfig(config, true); // dev mode

	if (workbenchConfig.enabled) {
		logger.debug('Workbench enabled (dev mode), generating source files for Vite HMR...');
		const { generateWorkbenchFiles } = await import('./workbench-generator');
		await generateWorkbenchFiles(rootDir, projectId, workbenchConfig, logger);
		// NOTE: In dev mode, we DON'T build workbench - Vite serves it directly with HMR
	}

	// Generate Vite config with all plugins
	const configPath = await generateViteConfig({
		rootDir,
		dev: true,
		projectId,
		orgId,
		deploymentId,
		workbenchPath: workbenchConfig.enabled ? workbenchConfig.route : undefined,
		logger,
	});

	// Create Vite server using the generated config
	const viteServer = await createServer({
		root: rootDir,
		configFile: configPath,
		server: {
			port,
			host: '127.0.0.1',
			middlewareMode: false,
		},
		logLevel: 'info',
	});

	// Start the Vite server (this will run the Hono app via @hono/vite-dev-server)
	await viteServer.listen();

	return { viteServer, appProcess: null };
}
