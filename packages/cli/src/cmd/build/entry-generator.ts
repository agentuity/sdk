/**
 * Vite-native entry file generator (v2 - clean architecture)
 * Single source for both dev and prod with minimal differences
 */

import { join } from 'node:path';
import type { Logger, WorkbenchConfig } from '../../types';
import { discoverRoutes } from './vite/route-discovery';

interface GenerateEntryOptions {
	rootDir: string;
	projectId: string;
	deploymentId: string;
	logger: Logger;
	mode: 'dev' | 'prod';
	workbench?: WorkbenchConfig;
	vitePort?: number; // Port of Vite asset server (dev mode only)
}

/**
 * Generate entry file with clean Vite-native architecture
 */
export async function generateEntryFile(options: GenerateEntryOptions): Promise<void> {
	const { rootDir, projectId, deploymentId, logger, mode, workbench, vitePort } = options;

	const srcDir = join(rootDir, 'src');
	const generatedDir = join(srcDir, 'generated');
	const entryPath = join(generatedDir, 'app.ts');

	logger.trace(`Generating unified entry file (supports both dev and prod modes)...`);

	// Discover routes to determine which files need to be imported
	const { routeInfoList } = await discoverRoutes(srcDir, projectId, deploymentId, logger);

	// Check for web and workbench
	const hasWebFrontend =
		(await Bun.file(join(srcDir, 'web', 'index.html')).exists()) ||
		(await Bun.file(join(srcDir, 'web', 'frontend.tsx')).exists());
	const hasWorkbench = !!workbench;

	// Get unique route files that need to be imported (relative to src/)
	const routeFiles = new Set<string>();
	for (const route of routeInfoList) {
		if (route.filename) {
			routeFiles.add(route.filename);
		}
	}

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
	];

	if (hasWorkbench) {
		runtimeImports.push(`  createWorkbenchRouter,`);
	}

	const imports = [
		`import { `,
		...runtimeImports,
		`} from '@agentuity/runtime';`,
		`import type { Context } from 'hono';`,
		`import { websocket } from 'hono/bun';`,
		// Conditionally import serveStatic and readFileSync for web frontend or workbench support
		hasWebFrontend || hasWorkbench ? `import { serveStatic } from 'hono/bun';` : '',
		hasWebFrontend || hasWorkbench ? `import { readFileSync, existsSync } from 'node:fs';` : '',
	].filter(Boolean);

	imports.push(`import { type LogLevel } from '@agentuity/core';`);
	imports.push(`import { bootstrapRuntimeEnv } from '@agentuity/runtime';`);

	// Generate route mounting code for all discovered routes
	const routeImportsAndMounts: string[] = [];
	let routeIndex = 0;

	for (const routeFile of routeFiles) {
		// Convert src/api/auth/route.ts -> auth/route
		const relativePath = routeFile.replace(/^src\/api\//, '').replace(/\.tsx?$/, '');

		// Determine the mount path
		// src/api/index.ts -> /api
		// src/api/auth/route.ts -> /api/auth
		// src/api/users/profile/route.ts -> /api/users/profile
		let mountPath = '/api';
		if (relativePath !== 'index') {
			// Remove 'route' or 'index' from the end
			const cleanPath = relativePath.replace(/\/(route|index)$/, '');
			if (cleanPath) {
				mountPath = `/api/${cleanPath}`;
			}
		}

		const importName = `router_${routeIndex++}`;
		routeImportsAndMounts.push(
			`const { default: ${importName} } = await import('../api/${relativePath}.js');`
		);
		routeImportsAndMounts.push(`app.route('${mountPath}', ${importName});`);
	}

	const apiMount =
		routeImportsAndMounts.length > 0
			? `
// Mount API routes
${routeImportsAndMounts.join('\n')}
`
			: '';

	// Workbench API routes mounting (if enabled)
	const workbenchApiMount = hasWorkbench
		? `
// Mount workbench API routes (/_agentuity/workbench/*)
const workbenchRouter = createWorkbenchRouter();
app.route('/', workbenchRouter);
`
		: '';

	// Asset proxy routes - Always generated, but only active at runtime when:
	//   - NODE_ENV !== 'production' (isDevelopment())
	//   - and process.env.VITE_PORT is set
	const assetProxyRoutes = `
// Asset proxy routes - Development mode only (proxies to Vite asset server)
if (isDevelopment() && process.env.VITE_PORT) {
	const VITE_ASSET_PORT = parseInt(process.env.VITE_PORT, 10);

	const proxyToVite = async (c: Context) => {
		const viteUrl = \`http://127.0.0.1:\${VITE_ASSET_PORT}\${c.req.path}\`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
		try {
			otel.logger.debug(\`[Proxy] \${c.req.method} \${c.req.path} -> Vite:\${VITE_ASSET_PORT}\`);
			const res = await fetch(viteUrl, { signal: controller.signal });
			clearTimeout(timeout);
			otel.logger.debug(\`[Proxy] \${c.req.path} -> \${res.status} (\${res.headers.get('content-type')})\`);
			return new Response(res.body, {
				status: res.status,
				headers: res.headers,
			});
		} catch (err) {
			clearTimeout(timeout);
			if (err instanceof Error && err.name === 'AbortError') {
				otel.logger.error(\`Vite proxy timeout: \${c.req.path}\`);
				return c.text('Vite asset server timeout', 504);
			}
			otel.logger.error(\`Failed to proxy to Vite: \${c.req.path} - \${err instanceof Error ? err.message : String(err)}\`);
			return c.text('Vite asset server error', 500);
		}
	};

	// Vite client scripts and HMR
	app.get('/@vite/*', proxyToVite);
	app.get('/@react-refresh', proxyToVite);

	// Source files for HMR
	app.get('/src/web/*', proxyToVite);
	app.get('/src/*', proxyToVite); // Catch-all for other source files

	// Workbench source files (in .agentuity/workbench-src/)
	app.get('/.agentuity/workbench-src/*', proxyToVite);

	// Node modules (Vite transforms these)
	app.get('/node_modules/*', proxyToVite);

	// Scoped packages (e.g., @agentuity/*, @types/*)
	app.get('/@*', proxyToVite);

	// File system access (for Vite's @fs protocol)
	app.get('/@fs/*', proxyToVite);

	// Module resolution (for Vite's @id protocol)
	app.get('/@id/*', proxyToVite);

	// Any .js, .jsx, .ts, .tsx files (catch remaining modules)
	app.get('/*.js', proxyToVite);
	app.get('/*.jsx', proxyToVite);
	app.get('/*.ts', proxyToVite);
	app.get('/*.tsx', proxyToVite);
	app.get('/*.css', proxyToVite);
}
`;

	// Runtime mode detection helper (defined at top level for reuse)
	// Dynamic property access prevents Bun.build from inlining NODE_ENV at build time
	const modeDetection = `
// Runtime mode detection helper
// Dynamic string concatenation prevents Bun.build from inlining NODE_ENV at build time
// See: https://github.com/oven-sh/bun/issues/20183
const getEnv = (key: string) => process.env[key];
const isDevelopment = () => getEnv('NODE' + '_' + 'ENV') !== 'production';
`;

	// Web routes (runtime mode detection)
	let webRoutes = '';
	if (hasWebFrontend) {
		webRoutes = `
// Web routes - Runtime mode detection (dev proxies to Vite, prod serves static)
if (isDevelopment()) {
	// Development mode: Proxy HTML from Vite to enable React Fast Refresh
	const VITE_ASSET_PORT = parseInt(process.env.VITE_PORT || '${vitePort || 5173}', 10);
	
	const devHtmlHandler = async (c: Context) => {
		const viteUrl = \`http://127.0.0.1:\${VITE_ASSET_PORT}/src/web/index.html\`;

		try {
			otel.logger.debug('[Proxy] GET /src/web/index.html -> Vite:%d', VITE_ASSET_PORT);
			const res = await fetch(viteUrl, { signal: AbortSignal.timeout(10000) });

			// Get HTML text and transform relative paths to absolute
			const html = await res.text();
			const transformedHtml = html
				.replace(/src="\\.\\//g, 'src="/src/web/')
				.replace(/href="\\.\\//g, 'href="/src/web/');

			return new Response(transformedHtml, {
				status: res.status,
				headers: res.headers,
			});
		} catch (err) {
			otel.logger.error('Failed to proxy HTML to Vite: %s', err instanceof Error ? err.message : String(err));
			return c.text('Vite asset server error (HTML)', 500);
		}
	};
	
	app.get('/', devHtmlHandler);
	
	// 404 for unmatched API/system routes
	app.all('/_agentuity/*', (c: Context) => c.notFound());
	app.all('/api/*', (c: Context) => c.notFound());
	${hasWorkbench ? '' : `app.all('/workbench/*', (c: Context) => c.notFound());`}
	
	// SPA fallback - serve index.html for client-side routing
	app.get('*', (c: Context) => {
		const path = c.req.path;
		// If path has a file extension, return 404 (prevents serving HTML for missing assets)
		if (/\\.[a-zA-Z0-9]+$/.test(path)) {
			return c.notFound();
		}
		return devHtmlHandler(c);
	});
} else {
	// Production mode: Serve static files from bundled output
	const indexHtmlPath = import.meta.dir + '/client/index.html';
	const indexHtml = existsSync(indexHtmlPath)
		? readFileSync(indexHtmlPath, 'utf-8')
		: '';
	
	if (!indexHtml) {
		otel.logger.warn('Production HTML not found at %s', indexHtmlPath);
	}
	
	app.get('/', (c: Context) => indexHtml ? c.html(indexHtml) : c.text('Production build incomplete', 500));

	// Serve static assets from /assets/* (Vite bundled output)
	app.use('/assets/*', serveStatic({ root: import.meta.dir + '/client' }));

	// Serve static public assets (favicon.ico, robots.txt, etc.)
	app.use('/*', serveStatic({ root: import.meta.dir + '/client', rewriteRequestPath: (path) => path }));

	// 404 for unmatched API/system routes (IMPORTANT: comes before SPA fallback)
	app.all('/_agentuity/*', (c: Context) => c.notFound());
	app.all('/api/*', (c: Context) => c.notFound());
	${hasWorkbench ? '' : `app.all('/workbench/*', (c: Context) => c.notFound());`}

	// SPA fallback with asset protection
	app.get('*', (c: Context) => {
		const path = c.req.path;
		// If path has a file extension, it's likely an asset request - return 404
		if (/\\.[a-zA-Z0-9]+$/.test(path)) {
			return c.notFound();
		}
		return c.html(indexHtml);
	});
}
`;
	}

	// Workbench routes (if enabled) - runtime mode detection
	const workbenchRoute = workbench?.route ?? '/workbench';
	const workbenchRoutes = hasWorkbench
		? `
// Workbench routes - Runtime mode detection
// Both dev and prod run from .agentuity/app.js (dev bundles before running)
// So workbench-src is always in the same directory
const workbenchSrcDir = import.meta.dir + '/workbench-src';
const workbenchIndexPath = import.meta.dir + '/workbench/index.html';
const workbenchIndex = existsSync(workbenchIndexPath) 
	? readFileSync(workbenchIndexPath, 'utf-8')
	: '';

if (isDevelopment()) {
	// Development mode: Let Vite serve source files with HMR
	app.get('${workbenchRoute}', async (c: Context) => {
		const html = await Bun.file(workbenchSrcDir + '/index.html').text();
		// Rewrite script/css paths to use Vite's @fs protocol
		const withVite = html
			.replace('src="./main.tsx"', \`src="/@fs\${workbenchSrcDir}/main.tsx"\`)
			.replace('href="./styles.css"', \`href="/@fs\${workbenchSrcDir}/styles.css"\`);
		return c.html(withVite);
	});
} else {
	// Production mode: Serve pre-built assets
	if (workbenchIndex) {
		app.get('${workbenchRoute}', (c: Context) => c.html(workbenchIndex));
		app.get('${workbenchRoute}/*', serveStatic({ root: import.meta.dir + '/workbench' }));
	}
}
`
		: '';

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
	(globalThis as any).__AGENTUITY_SERVER__ = server;
	
	otel.logger.info(\`Server listening on http://127.0.0.1:\${port}\`);
	if (isDevelopment() && process.env.VITE_PORT) {
		otel.logger.debug(\`Proxying Vite assets from port \${process.env.VITE_PORT}\`);
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

app.use('/_agentuity/*', createCorsMiddleware());
app.use('/api/*', createCorsMiddleware());

// Critical: otelMiddleware creates session/thread/waitUntilHandler
app.use('/_agentuity/*', createOtelMiddleware());
app.use('/api/*', createOtelMiddleware());

// Critical: agentMiddleware sets up agent context
app.use('/api/*', createAgentMiddleware(''));

// Step 4: Import user's app.ts (runs createApp, gets state/config)
await import('../../app.js');

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
