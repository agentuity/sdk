/**
 * Vite Dev Server Configuration
 *
 * Vite is the primary dev server — serves frontend assets natively and proxies
 * API/WebSocket requests to the Bun backend server.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { InlineConfig, Plugin } from 'vite';
import type { Logger } from '../../../types';

export interface GenerateAssetServerConfigOptions {
	rootDir: string;
	logger: Logger;
	workbenchPath?: string;
	port: number; // The port Vite will listen on (user-facing)
	backendPort: number; // The port Bun backend is running on (internal)
	/** User-defined route mount paths from createApp({ router }) (e.g., ['/api', '/v1']) */
	routePaths?: string[];
}

/**
 * Vite plugin that injects analytics config in dev mode.
 *
 * In dev mode we inject the analytics config and session script.
 * Users import '@agentuity/analytics/beacon' directly in their frontend code.
 */
function devAnalyticsPlugin(): Plugin {
	return {
		name: 'agentuity:dev-analytics',
		transformIndexHtml: {
			order: 'pre',
			handler(html) {
				// Default analytics config — matches resolveAnalyticsConfig(undefined) in runtime
				// Users import '@agentuity/analytics/beacon' in their frontend code
				const config = {
					enabled: true,
					trackClicks: true,
					trackScroll: true,
					trackOutboundLinks: true,
					trackForms: false,
					trackWebVitals: true,
					trackErrors: true,
					trackSPANavigation: true,
					isDevmode: true,
				};

				const injection =
					`<script>window.__AGENTUITY_ANALYTICS__=${JSON.stringify(config)};</script>` +
					'<script src="/_agentuity/webanalytics/session.js" async></script>';

				if (html.includes('</head>')) {
					return html.replace('</head>', `${injection}</head>`);
				}
				return html;
			},
		},
	};
}

/**
 * Vite plugin that serves src/web/index.html as the SPA fallback.
 *
 * Vite's built-in SPA fallback only serves index.html from the project root.
 * Since Agentuity apps keep their HTML entry at src/web/index.html, we need
 * this plugin to rewrite the URL so Vite's built-in transform pipeline
 * (including React Fast Refresh injection) processes it correctly.
 */
function spaFallbackPlugin(rootDir: string, routePaths: string[], workbenchPath?: string): Plugin {
	const htmlPath = join(rootDir, 'src', 'web', 'index.html');
	const hasHtml = existsSync(htmlPath);

	return {
		name: 'agentuity:spa-fallback',
		configureServer(server) {
			if (!hasHtml) return;

			server.middlewares.use(async (req, res, next) => {
				// Only handle GET/HEAD navigation requests
				if (req.method !== 'GET' && req.method !== 'HEAD') return next();

				const url = req.url || '/';
				const pathname = url.split('?')[0] || '/';
				const accept = req.headers.accept || '';
				const secFetchDest = req.headers['sec-fetch-dest'] || '';

				// For robustness, treat unknown GET/HEAD routes as potential SPA navigations.
				// We still avoid intercepting assets/backend paths via the filters below.
				// (This also makes non-browser readiness probes like fetch('/streams') work.)
				const isDocumentRequest = secFetchDest === 'document' || accept.includes('text/html');

				// Skip file requests (have an extension)
				if (pathname !== '/' && /\.[a-zA-Z0-9]+$/.test(pathname)) return next();

				// For non-document requests, only allow root path fallback.
				// (e.g. don't turn module/script fetches into HTML accidentally)
				if (!isDocumentRequest && pathname === '/') {
					// allow root fallback for simple probes
				}

				// Skip Vite/module/internal asset paths
				if (
					pathname.startsWith('/@vite') ||
					pathname.startsWith('/@react-refresh') ||
					pathname.startsWith('/@id/') ||
					pathname.startsWith('/@fs/') ||
					pathname.startsWith('/node_modules/') ||
					pathname.startsWith('/src/') ||
					(pathname.startsWith('/@') && !pathname.startsWith('/_agentuity'))
				) {
					return next();
				}

				// Skip paths that are proxied to the Bun backend
				if (
					pathname.startsWith('/_agentuity') ||
					pathname.startsWith('/_health') ||
					pathname.startsWith('/_idle')
				) {
					return next();
				}
				// Skip workbench path (served by Bun)
				if (
					workbenchPath &&
					(pathname === workbenchPath || pathname.startsWith(workbenchPath + '/'))
				) {
					return next();
				}
				for (const rp of routePaths) {
					if (pathname === rp || pathname.startsWith(rp + '/')) return next();
				}

				// If this isn't clearly a document navigation, still allow SPA fallback
				// for extensionless client-side routes like /streams, /rpc, /webrtc.
				// We already excluded backend paths and asset/module paths above.

				try {
					let html = await Bun.file(htmlPath).text();
					// Match old devHtmlHandler behavior from the generated Bun entry:
					// rewrite relative paths so the app works from / and client-side routes.
					html = html
						.replace(/src="\.\//g, 'src="/src/web/')
						.replace(/href="\.\//g, 'href="/src/web/');

					// Let Vite inject HMR client, React refresh preamble, etc.
					html = await server.transformIndexHtml(url, html, req.originalUrl);

					res.statusCode = 200;
					res.setHeader('Content-Type', 'text/html; charset=utf-8');
					res.end(html);
				} catch (error) {
					next(error as Error);
				}
			});
		},
	};
}

/**
 * Generate Vite config for asset-only server (HMR + React transformation)
 */
export async function generateAssetServerConfig(
	options: GenerateAssetServerConfigOptions
): Promise<InlineConfig> {
	const { rootDir, logger, workbenchPath, port, backendPort, routePaths = ['/api'] } = options;

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
			// Deduplicate React to prevent multiple instances (if used)
			dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
		},

		// Pre-bundle dependencies to avoid issues with pre-built packages
		// Only include @agentuity/workbench if workbench is enabled
		optimizeDeps: {
			include: workbenchPath ? ['@agentuity/workbench', '@agentuity/core'] : ['@agentuity/core'],
		},

		// Only allow frontend env vars (server uses process.env)
		envPrefix: ['VITE_', 'AGENTUITY_PUBLIC_', 'PUBLIC_'],

		server: {
			// Vite is the primary dev server — listens on the user-facing port
			port,
			strictPort: true, // Port is pre-verified as available by findAvailablePort()
			host: '127.0.0.1',

			// Proxy backend routes to Bun server (HTTP only).
			// WebSocket upgrades are handled by the front-door TCP proxy (ws-proxy.ts)
			// which routes them directly to the Bun backend, bypassing Vite entirely.
			// This avoids Bun's broken node:http upgrade socket implementation.
			proxy: {
				// User-defined route mounts (from createApp({ router }))
				...Object.fromEntries(
					routePaths.map((routePath) => [
						routePath,
						{
							target: `http://127.0.0.1:${backendPort}`,
							changeOrigin: true,
						},
					])
				),
				// Agentuity system routes (workbench API, health, analytics, etc.)
				'/_agentuity': {
					target: `http://127.0.0.1:${backendPort}`,
					changeOrigin: true,
				},
				// Workbench UI route (served by Bun, references /@fs/* paths handled by Vite)
				...(workbenchPath
					? {
							[workbenchPath]: {
								target: `http://127.0.0.1:${backendPort}`,
								changeOrigin: true,
							},
						}
					: {}),
				// Legacy health check routes
				'/_health': {
					target: `http://127.0.0.1:${backendPort}`,
					changeOrigin: true,
				},
				'/_idle': {
					target: `http://127.0.0.1:${backendPort}`,
					changeOrigin: true,
				},
			},

			// HMR works natively — Vite is the primary server, no proxy needed
			// Auto-detect host/protocol from page origin for tunnel support
			hmr: true,

			// Don't open browser automatically
			open: false,
		},

		// Define environment variables for browser
		define: {
			...(workbenchPath
				? { 'import.meta.env.AGENTUITY_PUBLIC_WORKBENCH_PATH': JSON.stringify(workbenchPath) }
				: {}),
			'import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY': JSON.stringify(
				process.env.AGENTUITY_SDK_KEY ? 'true' : 'false'
			),
			'process.env.NODE_ENV': JSON.stringify('development'),
		},

		// Agentuity-specific plugins (Vite loads user plugins from vite.config.ts automatically)
		plugins: await (async () => {
			const { browserEnvPlugin } = await import('./browser-env-plugin');
			const { publicAssetPathPlugin } = await import('./public-asset-path-plugin');

			return [
				// Browser env plugin to map process.env to import.meta.env
				browserEnvPlugin(),
				// Warn about incorrect public asset paths in dev mode
				publicAssetPathPlugin({ warnInDev: true }),
				// Inject analytics scripts in dev HTML
				devAnalyticsPlugin(),
				// SPA fallback: serve src/web/index.html for navigation requests
				spaFallbackPlugin(rootDir, routePaths, workbenchPath),
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
