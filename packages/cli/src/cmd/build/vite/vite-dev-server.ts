/**
 * Vite Dev Server
 *
 * Runs Vite dev server with HMR for both client and server code
 */

import { createServer, type ViteDevServer, type LogOptions, type LogErrorOptions } from 'vite';
import type { Logger } from '../../../types';
import { generateViteConfig } from './vite-config-generator';

/**
 * Create a custom Vite logger that uses our logger format
 */
function createViteLogger(logger: Logger) {
	return {
		info(msg: string, options?: LogOptions) {
			if (!options?.clear) {
				logger.debug(msg.replace('[vite] ', ''));
			}
		},
		warn(msg: string, _options?: LogOptions) {
			logger.warn(msg.replace('[vite] ', ''));
		},
		warnOnce(msg: string, _options?: LogOptions) {
			logger.warn(msg.replace('[vite] ', ''));
		},
		error(msg: string, _options?: LogErrorOptions) {
			logger.error(msg.replace('[vite] ', ''));
		},
		clearScreen() {
			// No-op - we don't want to clear screen
		},
		hasErrorLogged: () => false,
		hasWarned: false,
	};
}

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
	kill: (signal?: number | NodeJS.Signals) => void;
	exitCode: number | null;
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

	// Generate entry file first
	const { generateEntryFile } = await import('../entry-generator');
	await generateEntryFile({
		rootDir,
		projectId: projectId || '',
		deploymentId: deploymentId || '',
		logger,
		mode: 'dev',
		workbench: workbenchConfig.enabled ? workbenchConfig : undefined,
	});

	// Start WebSocket server BEFORE Vite server to ensure proxy target is ready
	logger.info('🔌 Starting WebSocket server on port 3501...');
	const wsPort = 3501;
	
	// We need to start the server manually and store reference globally
	// so the generated app can use it instead of starting its own
	logger.debug('Importing Node.js server dependencies...');
	const http = await import('node:http');
	
	// Create a basic HTTP server that will handle the app
	logger.debug(`Creating HTTP server on 127.0.0.1:${wsPort}...`);
	const server = http.createServer();
	
	// Add upgrade event listener for debugging
	server.on('upgrade', (request, _socket, _head) => {
		logger.debug(`[HTTP Server] Upgrade request received: ${request.url}`);
		logger.debug(`[HTTP Server] Upgrade headers: ${JSON.stringify(request.headers)}`);
	});
	
	server.on('error', (err) => {
		logger.error(`[HTTP Server] Error: ${err.message}`);
	});
	
	// Start listening
	await new Promise<void>((resolve) => {
		server.listen(wsPort, '127.0.0.1', () => {
			logger.info(`✅ WebSocket server listening on http://127.0.0.1:${wsPort}`);
			resolve();
		});
	});
	
	// Store server reference globally so generated app can attach to it
	(globalThis as unknown as { __AGENTUITY_WS_HTTP_SERVER__: typeof server }).__AGENTUITY_WS_HTTP_SERVER__ = server;

	// Load the generated app NOW to attach handlers BEFORE Vite starts
	logger.info('📦 Loading generated app to attach WebSocket handlers...');
	const appPath = `${rootDir}/.agentuity/app.generated.ts`;
	await import(appPath);
	logger.info('✅ App loaded and attached to WebSocket server');

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
	logger.info('📦 Creating Vite dev server...');
	const viteServer = await createServer({
		root: rootDir,
		configFile: configPath,
		server: {
			port,
			host: '127.0.0.1',
			middlewareMode: false,
		},
		logLevel: 'info',
		customLogger: createViteLogger(logger),
		clearScreen: false,
	});
	logger.debug('Vite server created');

	// Start the Vite server (WebSocket proxy target is already ready)
	logger.info('🚀 Starting Vite dev server (WebSocket proxy target ready)...');
	await viteServer.listen();
	logger.info(`✅ Vite dev server started on http://127.0.0.1:${port}`);

	return { viteServer, appProcess: null };
}
