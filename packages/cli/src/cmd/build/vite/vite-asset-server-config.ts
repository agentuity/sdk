/**
 * Vite Asset Server Configuration
 *
 * Minimal Vite config for serving frontend assets with HMR only.
 * Does NOT handle API routes, workbench, or WebSocket - that's the Bun server's job.
 */

import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { InlineConfig } from 'vite';
import type { Logger } from '../../../types';

export interface GenerateAssetServerConfigOptions {
	rootDir: string;
	logger: Logger;
	workbenchPath?: string;
	port: number; // The port Vite will run on (for HMR client configuration)
}

/**
 * Generate Vite config for asset-only server (HMR + React transformation)
 */
export async function generateAssetServerConfig(
	options: GenerateAssetServerConfigOptions
): Promise<InlineConfig> {
	const { rootDir, logger, workbenchPath, port } = options;

	// Load custom user config for define values and plugins
	const { loadAgentuityConfig } = await import('./config-loader');
	const userConfig = await loadAgentuityConfig(rootDir, logger);
	const userDefine = userConfig?.define || {};
	const userPlugins = userConfig?.plugins || [];

	if (Object.keys(userDefine).length > 0) {
		logger.debug(
			'Loaded %d custom define(s) from agentuity.config.ts',
			Object.keys(userDefine).length
		);
	}
	if (userPlugins.length > 0) {
		logger.debug('Loaded %d custom plugin(s) from agentuity.config.ts', userPlugins.length);
	}

	// Load path aliases from tsconfig.json if available
	const tsconfigPath = join(rootDir, 'tsconfig.json');
	let alias = {};

	try {
		const tsconfig = JSON.parse(await Bun.file(tsconfigPath).text());
		const paths = tsconfig?.compilerOptions?.paths || {};
		alias = Object.fromEntries(
			Object.entries(paths)
				.filter(([, value]) => {
					const pathArray = value as string[];
					return pathArray.length > 0 && pathArray[0] !== undefined;
				})
				.map(([key, value]) => {
					const pathArray = value as string[];
					const firstPath = pathArray[0] ?? '';
					return [key.replace('/*', ''), join(rootDir, firstPath.replace('/*', ''))];
				})
		);
	} catch {
		// No tsconfig or no paths - that's fine
	}

	return {
		root: rootDir,
		base: '/',
		clearScreen: false,
		// Serve public assets from src/web/public/ at root path (e.g., /favicon.png)
		// The Bun server proxies /public/* requests to Vite, rewriting to root paths
		publicDir: join(rootDir, 'src', 'web', 'public'),

		resolve: {
			alias,
			// Deduplicate React to prevent multiple instances
			dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
		},

		// Pre-bundle dependencies to avoid React preamble issues with pre-built JSX
		// Only include @agentuity/workbench if workbench is enabled
		optimizeDeps: {
			include: workbenchPath
				? ['@agentuity/workbench', '@agentuity/core', '@agentuity/react']
				: ['@agentuity/core', '@agentuity/react'],
		},

		// Only allow frontend env vars (server uses process.env)
		envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_', 'PUBLIC_'],

		server: {
			// Use the port we selected
			port,
			strictPort: false, // Allow fallback if port is taken
			host: '127.0.0.1',

			// CORS headers to allow Bun server on port 3500 to proxy requests
			cors: {
				origin: 'http://127.0.0.1:3500',
				credentials: true,
			},

			// HMR configuration for development with tunnel support (*.agentuity.live)
			// Do NOT set host/protocol - let Vite auto-detect from page origin
			// This allows HMR to work both locally and through the Gravity tunnel
			// The Bun server proxies /__vite_hmr WebSocket connections to Vite
			hmr: {
				// Use a dedicated path for HMR WebSocket to enable proxying
				path: '/__vite_hmr',
			},

			// Don't open browser - Bun server will be the entry point
			open: false,
		},

		// Define environment variables for browser
		define: {
			// Merge user-defined constants first
			...userDefine,
			// Then add default defines (these will override any user-defined protected keys)
			...(workbenchPath
				? { 'import.meta.env.AGENTUITY_PUBLIC_WORKBENCH_PATH': JSON.stringify(workbenchPath) }
				: {}),
			'import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY': JSON.stringify(
				process.env.AGENTUITY_SDK_KEY ? 'true' : 'false'
			),
			'process.env.NODE_ENV': JSON.stringify('development'),
		},

		// Plugins: User plugins first (includes framework plugin like React), then browser env
		// Try project's node_modules first, fall back to CLI's bundled version
		plugins: await (async () => {
			const projectRequire = createRequire(join(rootDir, 'package.json'));
			let reactPluginPath = '@vitejs/plugin-react';
			try {
				reactPluginPath = projectRequire.resolve('@vitejs/plugin-react');
			} catch {
				// Project doesn't have @vitejs/plugin-react, use CLI's bundled version
			}
			const { browserEnvPlugin } = await import('./browser-env-plugin');
			const { publicAssetPathPlugin } = await import('./public-asset-path-plugin');
			const { hasReactPlugin } = await import('./config-loader');

			// Auto-add React plugin if not present in user config (backwards compatibility)
			const resolvedUserPlugins = [...userPlugins];
			if (resolvedUserPlugins.length === 0 || !(await hasReactPlugin(rootDir, resolvedUserPlugins))) {
				logger.debug('React plugin not found in agentuity.config.ts plugins, adding automatically for dev server');
				const reactModule = await import(reactPluginPath);
				const reactPlugin = reactModule.default();
				resolvedUserPlugins.unshift(reactPlugin);
			}

			return [
				// User-defined plugins from agentuity.config.ts (includes framework plugin like React)
				...resolvedUserPlugins,
				// Browser env plugin to map process.env to import.meta.env
				browserEnvPlugin(),
				// Warn about incorrect public asset paths in dev mode
				publicAssetPathPlugin({ warnInDev: true }),
			];
		})(),

		// Suppress build-related options (this is dev-only)
		build: {
			rollupOptions: {
				external: ['vite', '@agentuity/cli'],
			},
		},

		// Custom logger to integrate with our logger
		customLogger: {
			info(msg: string) {
				// Show port-related messages at info level (important for debugging port conflicts)
				// Keep other Vite info messages (like HMR updates) at debug to avoid noise
				if (msg.includes('Port') || msg.includes('port')) {
					logger.info(`[Vite Asset] ${msg}`);
				} else {
					logger.debug(`[Vite Asset] ${msg}`);
				}
			},
			warn(msg: string) {
				logger.warn(`[Vite Asset] ${msg}`);
			},
			warnOnce(msg: string) {
				logger.warn(`[Vite Asset] ${msg}`);
			},
			error(msg: string) {
				logger.error(`[Vite Asset] ${msg}`);
			},
			clearScreen() {
				// No-op
			},
			hasErrorLogged: () => false,
			hasWarned: false,
		},

		logLevel: 'info',
	};
}
