/**
 * Vite-native entry file generator (v2 - clean architecture)
 * Single source for both dev and prod with minimal differences
 */

import { join } from 'node:path';
import type { Logger, WorkbenchConfig, AnalyticsConfig } from '../../types';
import { generateWebAnalyticsFile } from './webanalytics-generator';

interface GenerateEntryOptions {
	rootDir: string;
	projectId: string;
	deploymentId: string;
	logger: Logger;
	mode: 'dev' | 'prod';
	workbench?: WorkbenchConfig;
	analytics?: boolean | AnalyticsConfig;
	noBundle?: boolean; // Skip bundling — apply runtime patches instead
}

/**
 * Generate entry file with clean Vite-native architecture
 */
export async function generateEntryFile(options: GenerateEntryOptions): Promise<void> {
	const { rootDir, logger, mode, workbench, analytics, noBundle } = options;
	// projectId and deploymentId are part of the interface for consistency with
	// other build steps, but the entry file itself doesn't need them — routes
	// are mounted at runtime by getUserRouter().

	const srcDir = join(rootDir, 'src');
	const generatedDir = join(srcDir, 'generated');
	const entryPath = join(generatedDir, 'app.ts');

	logger.trace(`Generating unified entry file (supports both dev and prod modes)...`);

	// Check if analytics is enabled
	const analyticsEnabled = analytics !== false;

	// Generate web analytics files only if enabled
	if (analyticsEnabled) {
		await generateWebAnalyticsFile({ rootDir, logger, analytics });
	}

	// Check for web and workbench
	const hasWebFrontend =
		(await Bun.file(join(srcDir, 'web', 'index.html')).exists()) ||
		(await Bun.file(join(srcDir, 'web', 'frontend.tsx')).exists());
	// Workbench is configured at build time, but only enabled at runtime in dev mode
	const hasWorkbenchConfig = !!workbench;

	// Generate imports
	const runtimeImports = [
		`  createRouter,`,
		`  createBaseMiddleware,`,
		`  createCorsMiddleware,`,
		`  createOtelMiddleware,`,
		`  createAgentMiddleware,`,
		`  createCompressionMiddleware,`,
		`  getAppState,`,
		`  getAppConfig,`,
		`  getUserRouter,`,
		`  register,`,
		`  getSpanProcessors,`,
		`  createServices,`,
		`  runAgentSetups,`,
		`  getThreadProvider,`,
		`  getSessionProvider,`,
		`  setGlobalLogger,`,
		`  setGlobalTracer,`,
		`  setGlobalRouter,`,
		`  enableProcessExitProtection,`,
		`  hasWaitUntilPending,`,
		`  loadBuildMetadata,`,
		`  createWorkbenchRouter,`,
		`  bootstrapRuntimeEnv,`,
		`  patchBunS3ForStorageDev,`,
		`  runShutdown,`,
	];

	if (noBundle) {
		runtimeImports.push(`  applyDevPatches,`);
	}

	if (hasWebFrontend) {
		runtimeImports.push(`  mimeTypes,`);
	}

	const imports = [
		`import { `,
		...runtimeImports,
		`} from '@agentuity/runtime';`,
		`import type { Context } from 'hono';`,
		`import { websocket${hasWebFrontend ? ', serveStatic' : ''} } from 'hono/bun';`,
		hasWebFrontend ? `import { readFileSync, existsSync } from 'node:fs';` : '',
	].filter(Boolean);

	imports.push(`import { type LogLevel } from '@agentuity/core';`);
	if (analyticsEnabled) {
		imports.push(`import { injectAnalytics, registerAnalyticsRoutes } from './webanalytics.js';`);
		imports.push(`import { analyticsConfig } from './analytics-config.js';`);
	}

	const apiMount = `
// Mount user-provided routers from createApp({ router })
const __userMounts = getUserRouter();
if (__userMounts) {
	for (const mount of __userMounts) {
		// Apply Agentuity middleware (CORS, OTel, agent context) to each user-provided prefix
		const prefix = mount.path.endsWith('/') ? mount.path + '*' : mount.path + '/*';
		app.use(prefix, createCorsMiddleware());
		app.use(prefix, createOtelMiddleware());
		app.use(prefix, createAgentMiddleware(''));
		app.route(mount.path, mount.router);
	}
}
`;

	// Workbench API routes mounting
	// Always mounted - these routes are needed for the cloud workbench to communicate with deployed agents
	// Auth is handled by middleware inside the router (signature verification in production, no auth in development)
	// The hasWorkbenchConfig flag only controls whether the local workbench UI is served
	const workbenchApiMount = `
// Mount workbench API routes (/_agentuity/workbench/*)
// Always available for cloud workbench communication
// Auth is handled inside the router (signature verification in production)
const workbenchRouter = createWorkbenchRouter();
app.route('/', workbenchRouter);

// hasWorkbenchConfig controls whether the local workbench UI is served (dev mode only)
const hasWorkbenchConfig = ${hasWorkbenchConfig};
`;

	// Asset proxy routes removed — Vite is the primary dev server and serves
	// frontend assets natively. API/WS requests are proxied by Vite to Bun.
	const assetProxyRoutes = '';

	// Runtime mode detection helper (defined at top level for reuse)
	// Dynamic property access prevents Bun.build from inlining NODE_ENV at build time
	const modeDetection = `
// Runtime mode detection helper
// Dynamic string concatenation prevents Bun.build from inlining NODE_ENV at build time
// See: https://github.com/oven-sh/bun/issues/20183
const getEnv = (key: string) => process.env[key];
const isDevelopment = () => getEnv('NODE' + '_' + 'ENV') !== 'production';
`;

	// Web routes — production only (dev mode is handled by Vite primary server)
	let webRoutes = '';
	if (hasWebFrontend) {
		webRoutes = `
// Web routes - Production mode: Serve static files from bundled output
// In development, Vite serves frontend assets natively (no Bun proxy needed)
if (!isDevelopment()) {
	const indexHtmlPath = import.meta.dir + '/client/index.html';
	const baseIndexHtml = existsSync(indexHtmlPath)
		? readFileSync(indexHtmlPath, 'utf-8')
		: '';
	
	if (!baseIndexHtml) {
		otel.logger.warn('Production HTML not found at %s', indexHtmlPath);
	}

	const prodHtmlHandler = (c: Context) => {
		if (!baseIndexHtml) {
			return c.text('Production build incomplete', 500);
		}
${
	analyticsEnabled
		? `		// Inject analytics config and script (session/thread loaded via session.js)
		const html = injectAnalytics(baseIndexHtml, analyticsConfig);
		return c.html(html);`
		: `		return c.html(baseIndexHtml);`
}
	};
	
	app.get('/', prodHtmlHandler);

	// Serve static assets from /assets/* (Vite bundled output)
	app.use('/assets/*', serveStatic({ root: import.meta.dir + '/client', mimes: mimeTypes }));

	// Serve static public assets (favicon.ico, robots.txt, etc.)
	app.use('/*', serveStatic({ root: import.meta.dir + '/client', rewriteRequestPath: (path) => path, mimes: mimeTypes }));

	// 404 for unmatched API/system routes (IMPORTANT: comes before SPA fallback)
	app.all('/_agentuity/*', (c: Context) => c.notFound());
	app.all('/api/*', (c: Context) => c.notFound());

	// SPA fallback with asset protection
	app.get('*', (c: Context) => {
		const path = c.req.path;
		// If path has a file extension, it's likely an asset request - return 404
		if (/\\.[a-zA-Z0-9]+$/.test(path)) {
			return c.notFound();
		}
		return prodHtmlHandler(c);
	});
}
`;
	}

	// Workbench UI routes (development only)
	// The workbench UI is only served in development mode; the API routes are always available
	const workbenchRoute = workbench?.route ?? '/workbench';
	const workbenchRoutes = `
// Workbench UI is only available in development mode (API routes are always available)
if (hasWorkbenchConfig && isDevelopment()) {
	const workbenchSrcDir = import.meta.dir + '/workbench-src';
	const workbenchIndexPath = import.meta.dir + '/workbench-src/index.html';
	app.get('${workbenchRoute}', async (c: Context) => {
		const html = await Bun.file(workbenchIndexPath).text();
		// Rewrite script/css paths to use Vite's @fs protocol
		const withVite = html
			.replace('src="./main.tsx"', \`src="/@fs\${workbenchSrcDir}/main.tsx"\`)
			.replace('href="./styles.css"', \`href="/@fs\${workbenchSrcDir}/styles.css"\`);
		return c.html(withVite);
	});
}
`;

	// Server startup (same for dev and prod - Bun.serve with native WebSocket)
	const serverStartup = `
// Start Bun server
if (typeof Bun !== 'undefined') {
	// Enable process exit protection now that we're starting the server
	enableProcessExitProtection();

	const port = parseInt(process.env.PORT || '3500', 10);

	const server = Bun.serve({
		fetch: (req, server) => {
			// Get timeout from config on each request (0 = no timeout)
			server.timeout(req, getAppConfig()?.requestTimeout ?? 0);
			return app.fetch(req, server);
		},
		websocket,
		port,
		hostname: '127.0.0.1',
		development: isDevelopment(),
	});
	
	// Make server available globally for health checks
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_SERVER__ = server;
	
	otel.logger.info(\`Server listening on http://127.0.0.1:\${port}\`);

	// Register signal handlers for graceful shutdown (production only)
	// Dev mode has its own handlers in devmode.ts
	if (!isDevelopment()) {
		const handleShutdown = async (signal: string) => {
			otel.logger.info(\`Received \${signal}, initiating graceful shutdown...\`);
			try {
				await runShutdown();
				otel.logger.info('Shutdown complete');
			} catch (err) {
				otel.logger.error(\`Error during shutdown: \${err instanceof Error ? err.message : String(err)}\`);
			}
			process.exit(0);
		};

		process.once('SIGTERM', () => handleShutdown('SIGTERM'));
		process.once('SIGINT', () => handleShutdown('SIGINT'));
	}
}

// FOUND AN ERROR IN THIS FILE?
// Please file an issue at https://github.com/agentuity/sdk/issues
// or if you know the fix please submit a PR!
`;

	const healthRoutes = `
// Health check routes (production only)
if (!isDevelopment()) {
	const healthHandler = (c: Context) => {
		return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
	};
	const idleHandler = (c: Context) => {
		// Check if server is idle (no pending requests/connections)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const server = (globalThis as any).__AGENTUITY_SERVER__;
		if (!server) return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		
		// Check for pending background tasks
		if (hasWaitUntilPending()) return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		
		if (server.pendingRequests > 1) return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		if (server.pendingWebSockets > 0) return c.text('NO', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		
		return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
	};
	app.get('/_agentuity/health', healthHandler);
	app.get('/_health', healthHandler);
	app.get('/_agentuity/idle', idleHandler);
	app.get('/_idle', idleHandler);
}

// Dev readiness check - verifies Vite asset server is ready to serve frontend
if (isDevelopment()) {
	app.get('/_agentuity/ready', async (c: Context) => {
		const vitePort = process.env.VITE_PORT;
		if (!vitePort) {
			// No Vite port means we're not using Vite proxy
			return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
		}

		try {
			// Probe Vite to check if it can serve the main entry point
			// Use @vite/client as a lightweight check - it's always available
			const viteUrl = \`http://127.0.0.1:\${vitePort}/@vite/client\`;
			const res = await fetch(viteUrl, {
				signal: AbortSignal.timeout(5000),
				method: 'HEAD'
			});

			if (res.ok) {
				return c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
			}
			return c.text('VITE_NOT_READY', 503, { 'Content-Type': 'text/plain; charset=utf-8' });
		} catch (err) {
			otel.logger.debug('Vite readiness check failed: %s', err instanceof Error ? err.message : String(err));
			return c.text('VITE_NOT_READY', 503, { 'Content-Type': 'text/plain; charset=utf-8' });
		}
	});
}
`;

	const devPatchesStep = noBundle
		? `
// Step 0.1: Apply runtime dev patches (--experimental-no-bundle mode)
// Replaces build-time Bun.build patches for LLM gateway routing, AI SDK telemetry, and OTel spans
if (isDevelopment()) {
	await applyDevPatches();
}
`
		: '';
	const code = `// @generated
// Auto-generated by Agentuity
// DO NOT EDIT - This file is regenerated on every build
// Supports both development and production modes via runtime detection
${imports.join('\n')}

${modeDetection}

// Step 0: Bootstrap runtime environment (load profile-specific .env files)
// Only in development - production env vars are injected by platform
// This must happen BEFORE any imports that depend on environment variables
if (isDevelopment()) {
	// Pass project directory (two levels up from src/generated/) so .env files are loaded correctly
	await bootstrapRuntimeEnv({ projectDir: import.meta.dir + '/../..' });
}

${devPatchesStep}

// Step 0.25: load our runtime metadata and cache it
loadBuildMetadata();

// Step 0.5: Patch Bun's S3 client for Agentuity storage endpoints
// Agentuity storage uses virtual-hosted-style URLs (*.storage.dev)
// This patches s3.file() to automatically set virtualHostedStyle: true
patchBunS3ForStorageDev();

// Step 1: Initialize telemetry and services
const serverUrl = \`http://127.0.0.1:\${process.env.PORT || '3500'}\`;
const otel = register({ processors: getSpanProcessors(), logLevel: (process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel });

// Step 2: Create router and set as global
const app = createRouter();
setGlobalRouter(app);

// Step 3: Apply middleware in correct order (BEFORE mounting routes)
// Compression runs first (outermost) so it can compress the final response
app.use('*', createCompressionMiddleware());

app.use('*', createBaseMiddleware({
	logger: otel.logger,
	tracer: otel.tracer,
	meter: otel.meter,
}));

// Workbench routes always get OTel middleware for session tracking
app.use('/_agentuity/workbench/*', createOtelMiddleware());

// Note: /api/* middleware (CORS, OTel, agent context) is applied in Step 6
// after app.ts import, so user-provided routers can specify custom prefixes.

// Step 4: Import user's app.ts (runs createApp, gets state/config)
await import('../../app.js');

// Step 4.5: Import agent registry to ensure all agents are registered
// This is needed for workbench metadata to return JSON schemas
await import('./registry.js');

// Step 5: Initialize providers
const appState = getAppState();
const appConfig = getAppConfig();

createServices(otel.logger, appConfig, serverUrl);

// Make logger and tracer globally available for user's app.ts
setGlobalLogger(otel.logger);
setGlobalTracer(otel.tracer);

const threadProvider = getThreadProvider();
const sessionProvider = getSessionProvider();

await threadProvider.initialize(appState);
await sessionProvider.initialize(appState);

// Step 6: Mount routes (AFTER middleware is applied)

${healthRoutes}

${
	analyticsEnabled
		? `// Register analytics routes
registerAnalyticsRoutes(app);`
		: ''
}

${assetProxyRoutes}
${apiMount}
${workbenchApiMount}
${workbenchRoutes}
${webRoutes}

// Step 7: Run agent setup to signal completion
await runAgentSetups(appState);

${serverStartup}
`;

	// Collapse 2+ consecutive empty lines into 1 empty line (3+ \n becomes 2 \n)
	const cleanedCode = code.replace(/\n{3,}/g, '\n\n');

	await Bun.write(entryPath, cleanedCode);
	logger.trace(`Generated unified entry file at %s (mode: ${mode})`, entryPath);
}
