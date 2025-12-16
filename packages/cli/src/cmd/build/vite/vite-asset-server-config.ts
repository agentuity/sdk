/**
 * Vite Asset Server Configuration
 *
 * Minimal Vite config for serving frontend assets with HMR only.
 * Does NOT handle API routes, workbench, or WebSocket - that's the Bun server's job.
 */

import { join } from 'node:path';
import type { Logger } from '../../../types';
import type { InlineConfig } from 'vite';

export interface GenerateAssetServerConfigOptions {
	rootDir: string;
	logger: Logger;
}

/**
 * Generate Vite config for asset-only server (HMR + React transformation)
 */
export async function generateAssetServerConfig(
	options: GenerateAssetServerConfigOptions
): Promise<InlineConfig> {
	const { rootDir, logger } = options;

	// Load path aliases from tsconfig.json if available
	const tsconfigPath = join(rootDir, 'tsconfig.json');
	let alias = {};

	try {
		const tsconfig = JSON.parse(await Bun.file(tsconfigPath).text());
		const paths = tsconfig?.compilerOptions?.paths || {};
		alias = Object.fromEntries(
			Object.entries(paths).map(([key, value]) => {
				const pathArray = value as string[];
				return [key.replace('/*', ''), join(rootDir, pathArray[0].replace('/*', ''))];
			})
		);
	} catch {
		// No tsconfig or no paths - that's fine
	}

	return {
		root: rootDir,
		base: '/',
		clearScreen: false,
		publicDir: false, // Don't serve public dir - Bun server handles that

		resolve: { alias },

		// Only allow frontend env vars (server uses process.env)
		envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_', 'PUBLIC_'],

		server: {
			// Let Vite choose an available port
			strictPort: false,
			host: '127.0.0.1',

			// CORS headers to allow Bun server on port 3500 to proxy requests
			cors: {
				origin: 'http://127.0.0.1:3500',
				credentials: true,
			},

			// HMR configuration
			hmr: {
				protocol: 'ws',
				host: '127.0.0.1',
			},

			// Don't open browser - Bun server will be the entry point
			open: false,
		},

		// Minimal plugins - just React and HMR
		plugins: [
			// React plugin for JSX/TSX transformation and Fast Refresh
			(await import('@vitejs/plugin-react')).default(),
		],

		// Suppress build-related options (this is dev-only)
		build: {
			rollupOptions: {
				external: ['vite', '@agentuity/cli'],
			},
		},

		// Custom logger to integrate with our logger
		customLogger: {
			info(msg: string) {
				if (!msg.includes('[vite]')) {
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
