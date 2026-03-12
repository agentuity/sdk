/**
 * Server bootstrap — replaces the generated entry file's orchestration logic.
 *
 * Called after registry and user app.ts have been imported:
 *
 *   import './registry.js';     // registers agents
 *   import '../../app.js';      // runs createApp()
 *   await bootstrap();          // wires everything up and starts server
 *
 * The order matters: by the time bootstrap() runs, agents are registered
 * and createApp() has stored config/state in globals.
 */

import type { Context } from 'hono';
import { websocket, serveStatic } from 'hono/bun';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LogLevel } from '@agentuity/core';
import { mimeTypes, bootstrapRuntimeEnv } from '@agentuity/server';

import { getAppState, getAppConfig, getUserRouter, runShutdown } from './app';
import type { AnalyticsOptions, WorkbenchOptions } from './app';
import { createRouter } from './router';
import {
	createBaseMiddleware,
	createCorsMiddleware,
	createOtelMiddleware,
	createCompressionMiddleware,
	createWebSessionMiddleware,
} from './middleware';
import { runAgentSetups, createAgentMiddleware } from './agent';
import { register } from './otel/config';
import { createServices, getThreadProvider, getSessionProvider } from './_services';
import { setGlobalLogger, setGlobalTracer, setGlobalRouter, getSpanProcessors } from './_server';
import { enableProcessExitProtection } from './_process-protection';
import { hasWaitUntilPending } from './_waituntil';
import { loadBuildMetadata } from './_metadata';
import { createWorkbenchRouter } from './workbench';
import { patchBunS3ForStorageDev } from './bun-s3-patch';
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
const isDevelopment = () => getEnv('NODE' + '_' + 'ENV') !== 'production';

// ============================================================================
// Analytics helpers
// ============================================================================

/** Resolve analytics config with defaults */
function resolveAnalyticsConfig(
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
function resolveWorkbenchConfig(workbench: boolean | string | WorkbenchOptions | undefined): {
	enabled: boolean;
	route: string;
	headers: Record<string, string>;
} {
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
function registerAnalyticsRoutes(
	app: ReturnType<typeof createRouter>,
	_analyticsConfig: AnalyticsOptions & { enabled: boolean }
): void {
	// Session script endpoint — sets cookie and returns thread ID
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

	// Dev mode only: serve beacon script from local route
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

function registerHealthRoutes(app: ReturnType<typeof createRouter>): void {
	// Production health checks
	if (!isDevelopment()) {
		const healthHandler = (c: Context) => {
			return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		};
		const idleHandler = (c: Context) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const server = (globalThis as any).__AGENTUITY_SERVER__;
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

	// Dev readiness check
	if (isDevelopment()) {
		app.get('/_agentuity/ready', (c: Context) => {
			return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		});
	}
}

// ============================================================================
// Web routes (production static serving)
// ============================================================================

function registerWebRoutes(
	app: ReturnType<typeof createRouter>,
	analyticsConfig: AnalyticsOptions & { enabled: boolean }
): void {
	if (isDevelopment()) {
		// In dev mode, Vite is the primary server and serves frontend assets natively.
		// No Bun-side web routes needed.
		return;
	}

	// Production: serve static files from .agentuity/client/
	const clientDir = join(process.cwd(), '.agentuity', 'client');
	const indexHtmlPath = join(clientDir, 'index.html');
	const baseIndexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, 'utf-8') : '';

	if (!baseIndexHtml) {
		// No client build — this app has no web frontend
		return;
	}

	const prodHtmlHandler = (c: Context) => {
		if (analyticsConfig.enabled) {
			const html = injectAnalytics(baseIndexHtml, analyticsConfig);
			return c.html(html);
		}
		return c.html(baseIndexHtml);
	};

	app.get('/', prodHtmlHandler);

	// Serve Vite-bundled assets
	app.use('/assets/*', serveStatic({ root: clientDir, mimes: mimeTypes }));

	// Serve public files (favicon.ico, robots.txt, etc.)
	app.use(
		'/*',
		serveStatic({
			root: clientDir,
			rewriteRequestPath: (path: string) => path,
			mimes: mimeTypes,
		})
	);

	// 404 for unmatched API/system routes (before SPA fallback)
	app.all('/_agentuity/*', (c: Context) => c.notFound());
	app.all('/api/*', (c: Context) => c.notFound());

	// SPA fallback
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

function registerWorkbenchUI(
	app: ReturnType<typeof createRouter>,
	workbenchConfig: { enabled: boolean; route: string }
): void {
	if (!workbenchConfig.enabled || !isDevelopment()) return;

	const workbenchSrcDir = join(process.cwd(), '.agentuity', 'workbench-src');
	const workbenchIndexPath = join(workbenchSrcDir, 'index.html');

	app.get(workbenchConfig.route, async (c: Context) => {
		const html = await Bun.file(workbenchIndexPath).text();
		// Rewrite script/css paths to use Vite's @fs protocol for HMR
		const withVite = html
			.replace('src="./main.tsx"', `src="/@fs${workbenchSrcDir}/main.tsx"`)
			.replace('href="./styles.css"', `href="/@fs${workbenchSrcDir}/styles.css"`);
		return c.html(withVite);
	});
}

// ============================================================================
// Server startup
// ============================================================================

function startServer(app: ReturnType<typeof createRouter>): void {
	if (typeof Bun === 'undefined') return;

	enableProcessExitProtection();

	const port = parseInt(process.env.PORT || '3500', 10);

	const server = Bun.serve({
		fetch: (req, server) => {
			server.timeout(req, getAppConfig()?.requestTimeout ?? 0);
			return app.fetch(req, server);
		},
		websocket,
		port,
		hostname: '127.0.0.1',
		development: isDevelopment(),
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_SERVER__ = server;

	// Register signal handlers for graceful shutdown (production only)
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

// ============================================================================
// Bootstrap
// ============================================================================

/**
 * Bootstrap the Agentuity server.
 *
 * This is the single entry point that replaces the generated entry file's
 * orchestration logic. Call after importing registry and user app:
 *
 * ```ts
 * import './registry.js';
 * import '../../app.js';
 * await bootstrap();
 * ```
 */
export async function bootstrap(): Promise<void> {
	// Step 0: Bootstrap runtime environment (load service URLs, region, etc.)
	if (isDevelopment()) {
		bootstrapRuntimeEnv();
	}

	// Step 0.25: Apply runtime dev patches if in no-bundle mode
	// In normal mode, LLM patches are applied at Bun.build time.
	// In no-bundle mode, the entry file is run directly, so patches must be applied at runtime.
	if (isDevelopment() && process.env.AGENTUITY_NO_BUNDLE === 'true') {
		const { applyDevPatches } = await import('./dev-patches');
		await applyDevPatches();
	}

	// Step 0.5: Load build metadata and patch S3
	loadBuildMetadata();
	patchBunS3ForStorageDev();

	// Step 1: Read config from createApp() (already ran via app.ts import)
	const appConfig = getAppConfig();
	const analyticsConfig = resolveAnalyticsConfig(appConfig?.analytics);
	const workbenchConfig = resolveWorkbenchConfig(appConfig?.workbench);

	// Step 2: Initialize telemetry
	const otel = register({
		processors: getSpanProcessors(),
		logLevel: (process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel,
	});
	setGlobalLogger(otel.logger);
	setGlobalTracer(otel.tracer);

	// Step 3: Create router and set as global
	const app = createRouter();
	setGlobalRouter(app);

	// Step 4: Apply middleware in correct order
	app.use('*', createCompressionMiddleware());
	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	// Workbench routes get OTel middleware
	app.use('/_agentuity/workbench/*', createOtelMiddleware());

	// Step 5: Initialize services
	const serverUrl = `http://127.0.0.1:${process.env.PORT || '3500'}`;
	createServices(otel.logger, appConfig, serverUrl);

	const appState = getAppState();
	const threadProvider = getThreadProvider();
	const sessionProvider = getSessionProvider();
	await threadProvider.initialize(appState);
	await sessionProvider.initialize(appState);

	// Step 6: Mount routes

	// Health routes
	registerHealthRoutes(app);

	// Analytics routes
	if (analyticsConfig.enabled) {
		registerAnalyticsRoutes(app, analyticsConfig);
	}

	// User-provided routers (from createApp({ router }))
	const userMounts = getUserRouter();
	if (userMounts) {
		for (const mount of userMounts) {
			const prefix = mount.path.endsWith('/') ? mount.path + '*' : mount.path + '/*';
			app.use(prefix, createCorsMiddleware());
			app.use(prefix, createOtelMiddleware());
			app.use(prefix, createAgentMiddleware(''));
			app.route(mount.path, mount.router);
		}
	}

	// Workbench API routes (always mounted for cloud workbench)
	const workbenchRouter = createWorkbenchRouter();
	app.route('/', workbenchRouter);

	// Workbench UI (dev only)
	registerWorkbenchUI(app, workbenchConfig);

	// Web routes (prod static serving)
	registerWebRoutes(app, analyticsConfig);

	// Step 7: Run agent setups
	await runAgentSetups(appState);

	// Step 8: Start server
	startServer(app);

	otel.logger.info(`Server listening on http://127.0.0.1:${process.env.PORT || '3500'}`);
}
