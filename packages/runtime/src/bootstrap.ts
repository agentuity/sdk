/**
 * Server lifecycle helpers.
 *
 * These functions are called by createApp() to set up routes, middleware,
 * and the Bun HTTP server. They're kept separate to keep createApp() focused
 * on orchestration while these handle the details.
 */

import type { Context } from 'hono';
import { websocket, serveStatic } from 'hono/bun';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mimeTypes } from '@agentuity/server';

import { runShutdown } from './app';
import type { AnalyticsOptions, WorkbenchOptions } from './app';
import { createRouter } from './router';
import { createWebSessionMiddleware } from './middleware';
import { enableProcessExitProtection } from './_process-protection';
import { hasWaitUntilPending } from './_waituntil';
import { getOrganizationId, getProjectId, isDevMode as runtimeIsDevMode } from './_config';
import { BEACON_SCRIPT } from '@agentuity/frontend';

// ============================================================================
// Mode detection
// ============================================================================

/**
 * Runtime mode detection.
 * Dynamic string concatenation prevents Bun.build from inlining NODE_ENV.
 * @see https://github.com/oven-sh/bun/issues/20183
 */
const getEnv = (key: string) => process.env[key];
/**
 * Check if running in development mode.
 *
 * The CLI dev server explicitly sets NODE_ENV='development'. In production
 * (cloud deployment, CI integration test running a built app.js), NODE_ENV
 * may be 'production' or unset entirely. When unset, we assume production
 * — the dev server always sets it, so absence means production.
 */
export const isDevelopment = () => getEnv('NODE' + '_' + 'ENV') === 'development';

// ============================================================================
// Analytics helpers
// ============================================================================

/** Resolve analytics config with defaults */
export function resolveAnalyticsConfig(
	analytics: boolean | AnalyticsOptions | undefined
): AnalyticsOptions & { enabled: boolean } {
	if (analytics === false) {
		return { enabled: false };
	}
	const opts = typeof analytics === 'object' ? analytics : {};
	return {
		enabled: opts.enabled !== false,
		requireConsent: opts.requireConsent ?? false,
		trackClicks: opts.trackClicks ?? true,
		trackScroll: opts.trackScroll ?? true,
		trackOutboundLinks: opts.trackOutboundLinks ?? true,
		trackForms: opts.trackForms ?? false,
		trackWebVitals: opts.trackWebVitals ?? true,
		trackErrors: opts.trackErrors ?? true,
		trackSPANavigation: opts.trackSPANavigation ?? true,
		sampleRate: opts.sampleRate ?? 1,
		excludePatterns: opts.excludePatterns ?? [],
		globalProperties: opts.globalProperties ?? {},
	};
}

/** Resolve workbench config */
export function resolveWorkbenchConfig(
	workbench: boolean | string | WorkbenchOptions | undefined
): { enabled: boolean; route: string; headers: Record<string, string> } {
	if (!workbench) {
		return { enabled: false, route: '/workbench', headers: {} };
	}
	if (workbench === true) {
		return { enabled: true, route: '/workbench', headers: {} };
	}
	if (typeof workbench === 'string') {
		return { enabled: true, route: workbench, headers: {} };
	}
	return {
		enabled: true,
		route: workbench.route ?? '/workbench',
		headers: workbench.headers ?? {},
	};
}

/** Inject analytics scripts into HTML */
function injectAnalytics(
	html: string,
	analyticsConfig: AnalyticsOptions & { enabled: boolean }
): string {
	if (!analyticsConfig.enabled) return html;

	const orgId = getOrganizationId() || '';
	const projectId = getProjectId() || '';
	const isDevmode = runtimeIsDevMode();

	const pageConfig = {
		...analyticsConfig,
		orgId,
		projectId,
		isDevmode,
	};

	const configScript = `<script>window.__AGENTUITY_ANALYTICS__=${JSON.stringify(pageConfig)};</script>`;
	const sessionScript = '<script src="/_agentuity/webanalytics/session.js" async></script>';

	// In production, the beacon is already in HTML as a CDN asset (data-agentuity-beacon marker)
	const beaconMarker = '<script data-agentuity-beacon';
	if (html.includes(beaconMarker)) {
		const injection = configScript + sessionScript;
		return html.replace(beaconMarker, injection + beaconMarker);
	}

	// Development: beacon served from local route
	const beaconScript = '<script src="/_agentuity/webanalytics/analytics.js"></script>';
	const injection = configScript + sessionScript + beaconScript;

	if (html.includes('</head>')) {
		return html.replace('</head>', injection + '</head>');
	}
	if (html.includes('<body')) {
		return html.replace(/<body([^>]*)>/, `<body$1>${injection}`);
	}
	return injection + html;
}

/** Register analytics routes on the app */
export function registerAnalyticsRoutes(
	app: ReturnType<typeof createRouter>,
	_analyticsConfig: AnalyticsOptions & { enabled: boolean }
): void {
	app.get(
		'/_agentuity/webanalytics/session.js',
		createWebSessionMiddleware(),
		async (c: Context) => {
			const threadId = c.get('_webThreadId') || '';
			const sessionData = JSON.stringify({ threadId });
			const sessionScript = `window.__AGENTUITY_SESSION__=${sessionData};`;
			return new Response(sessionScript, {
				headers: {
					'Content-Type': 'application/javascript; charset=utf-8',
					'Cache-Control': 'no-store, no-cache, must-revalidate',
				},
			});
		}
	);

	if (isDevelopment()) {
		app.get('/_agentuity/webanalytics/analytics.js', async () => {
			return new Response(BEACON_SCRIPT, {
				headers: {
					'Content-Type': 'application/javascript; charset=utf-8',
					'Cache-Control': 'no-store, no-cache, must-revalidate',
				},
			});
		});
	}
}

// ============================================================================
// Health routes
// ============================================================================

export function registerHealthRoutes(app: ReturnType<typeof createRouter>): void {
	if (!isDevelopment()) {
		const healthHandler = (c: Context) => {
			return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		};
		const idleHandler = (c: Context) => {
			const server = globalThis.__AGENTUITY_SERVER__;
			if (!server) return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
			if (hasWaitUntilPending())
				return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
			if (server.pendingRequests > 1)
				return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
			if (server.pendingWebSockets > 0)
				return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
			return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		};
		app.get('/_agentuity/health', healthHandler);
		app.get('/_health', healthHandler);
		app.get('/_agentuity/idle', idleHandler);
		app.get('/_idle', idleHandler);
	}

	if (isDevelopment()) {
		app.get('/_agentuity/ready', (c: Context) => {
			return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		});
	}
}

// ============================================================================
// Web routes (production static serving)
// ============================================================================

export function registerWebRoutes(
	app: ReturnType<typeof createRouter>,
	analyticsConfig: AnalyticsOptions & { enabled: boolean }
): void {
	if (isDevelopment()) return;

	// Resolve client dir relative to the built app.js location (import.meta.dir)
	// rather than process.cwd(), since the app may be run from inside .agentuity/
	const appDir = typeof import.meta.dir === 'string' ? import.meta.dir : process.cwd();
	const clientDir = join(appDir, 'client');
	// Fallback: try process.cwd()/.agentuity/client if appDir/client doesn't exist
	const resolvedClientDir = existsSync(join(clientDir, 'index.html'))
		? clientDir
		: join(process.cwd(), '.agentuity', 'client');
	const indexHtmlPath = join(resolvedClientDir, 'index.html');
	const baseIndexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, 'utf-8') : '';

	if (!baseIndexHtml) return;

	const prodHtmlHandler = (c: Context) => {
		if (analyticsConfig.enabled) {
			const html = injectAnalytics(baseIndexHtml, analyticsConfig);
			return c.html(html);
		}
		return c.html(baseIndexHtml);
	};

	app.get('/', prodHtmlHandler);
	app.use('/assets/*', serveStatic({ root: resolvedClientDir, mimes: mimeTypes }));
	app.use(
		'/*',
		serveStatic({
			root: resolvedClientDir,
			rewriteRequestPath: (path: string) => path,
			mimes: mimeTypes,
		})
	);

	app.all('/_agentuity/*', (c: Context) => c.notFound());
	app.all('/api/*', (c: Context) => c.notFound());

	app.get('*', (c: Context) => {
		const path = c.req.path;
		if (/\.[a-zA-Z0-9]+$/.test(path)) {
			return c.notFound();
		}
		return prodHtmlHandler(c);
	});
}

// ============================================================================
// Workbench UI route (dev only)
// ============================================================================

export function registerWorkbenchUI(
	app: ReturnType<typeof createRouter>,
	workbenchConfig: { enabled: boolean; route: string }
): void {
	if (!workbenchConfig.enabled || !isDevelopment()) return;

	const workbenchSrcDir = join(process.cwd(), '.agentuity', 'workbench-src');
	const workbenchIndexPath = join(workbenchSrcDir, 'index.html');

	app.get(workbenchConfig.route, async (c: Context) => {
		const html = await Bun.file(workbenchIndexPath).text();
		const withVite = html
			.replace('src="./main.tsx"', `src="/@fs${workbenchSrcDir}/main.tsx"`)
			.replace('href="./styles.css"', `href="/@fs${workbenchSrcDir}/styles.css"`);
		return c.html(withVite);
	});
}

// ============================================================================
// Server startup
// ============================================================================

export function startServer(
	app: ReturnType<typeof createRouter>,
	options?: { requestTimeout?: number }
): void {
	if (typeof Bun === 'undefined') return;

	enableProcessExitProtection();

	const port = parseInt(process.env.PORT || '3500', 10);
	const requestTimeout = options?.requestTimeout ?? 0;

	const server = Bun.serve({
		fetch: (req, server) => {
			server.timeout(req, requestTimeout);
			return app.fetch(req, server);
		},
		websocket,
		port,
		hostname: '127.0.0.1',
		development: isDevelopment(),
	});

	globalThis.__AGENTUITY_SERVER__ = server;

	if (!isDevelopment()) {
		const handleShutdown = async (_signal: string) => {
			try {
				await runShutdown();
			} catch {
				// Ignore shutdown errors
			}
			process.exit(0);
		};

		process.once('SIGTERM', () => handleShutdown('SIGTERM'));
		process.once('SIGINT', () => handleShutdown('SIGINT'));
	}
}
