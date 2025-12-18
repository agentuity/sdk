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
	const isDev = mode === 'dev';

	const srcDir = join(rootDir, 'src');
	const agentuityDir = join(rootDir, '.agentuity');
	const entryPath = join(agentuityDir, 'app.generated.ts');

	logger.trace(`Generating ${mode} mode entry file...`);

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
		`  getAppState,`,
		`  getAppConfig,`,
		`  register,`,
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
		`import { websocket } from 'hono/bun';`, // Always use Bun WebSocket (dev and prod)
		!isDev && hasWebFrontend ? `import { serveStatic } from 'hono/bun';` : '',
	].filter(Boolean);

	imports.push(`import { type LogLevel } from '@agentuity/core';`);
	imports.push(`import { bootstrapRuntimeEnv } from '@agentuity/cli/runtime-bootstrap';`);

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
			`const { default: ${importName} } = await import('../src/api/${relativePath}.js');`
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

	// Asset proxy routes (dev mode only - proxy to Vite asset server)
	const assetProxyRoutes =
		isDev && vitePort
			? `
// Asset proxy routes - Forward Vite-specific requests to asset server
const VITE_ASSET_PORT = ${vitePort};

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
`
			: '';

	// Web routes (different for dev/prod)
	let webRoutes = '';
	if (hasWebFrontend) {
		if (isDev) {
			webRoutes = `
// Web routes (dev mode with Vite HMR via proxy)
// Proxy HTML from Vite to let @vitejs/plugin-react handle React Fast Refresh preamble
const devHtmlHandler = async (c: Context) => {
	const viteUrl = \`http://127.0.0.1:${vitePort}/src/web/index.html\`;

	try {
		otel.logger.debug('[Proxy] GET /src/web/index.html -> Vite:%d', ${vitePort});
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
// Asset requests (/*.js, /*.tsx, /*.css, etc.) are handled by Vite proxy routes if present,
// otherwise we check for file extensions to avoid returning HTML for missing assets
app.get('*', (c: Context) => {
	const path = c.req.path;
	// If path has a file extension and Vite proxy isn't handling it, return 404
	// This prevents returning HTML for missing assets like /foo.js
	if (${!vitePort} && /\\.[a-zA-Z0-9]+$/.test(path)) {
		return c.notFound();
	}
	return devHtmlHandler(c);
});
`;
		} else {
			webRoutes = `
// Web routes (production - static files)
import { readFileSync } from 'node:fs';
const indexHtml = readFileSync(import.meta.dir + '/client/index.html', 'utf-8');

app.get('/', (c: Context) => c.html(indexHtml));

// Serve static assets from /assets/* (Vite bundled output)
app.use('/assets/*', serveStatic({ root: import.meta.dir + '/client' }));

// Serve static public assets (favicon.ico, robots.txt, etc. from Vite's public folder)
app.use('/*', serveStatic({ root: import.meta.dir + '/client', rewriteRequestPath: (path) => path }));

// 404 for unmatched API/system routes (IMPORTANT: comes before SPA fallback)
app.all('/_agentuity/*', (c: Context) => c.notFound());
app.all('/api/*', (c: Context) => c.notFound());
${hasWorkbench ? '' : `app.all('/workbench/*', (c: Context) => c.notFound());`}

// SPA fallback with asset protection
// In production, we need to distinguish between:
//   - SPA routes like /dashboard, /users/123 (should return HTML)
//   - Missing assets like /foo.js, /bar.css (should return 404)
// We check for file extensions to detect asset requests
app.get('*', (c: Context) => {
	const path = c.req.path;
	// If path has a file extension, it's likely an asset request
	// Return 404 instead of serving HTML
	if (/\\.[a-zA-Z0-9]+$/.test(path)) {
		return c.notFound();
	}
	return c.html(indexHtml);
});
`;
		}
	}

	// Workbench routes (if enabled)
	const workbenchRoute = workbench?.route ?? '/workbench';
	const workbenchSrcDir = join(agentuityDir, 'workbench-src');
	const workbenchRoutes = hasWorkbench
		? isDev
			? `
// Workbench route (dev mode - let Vite serve source files with HMR)
app.get('${workbenchRoute}', async (c: Context) => {
	const html = await Bun.file('${workbenchSrcDir}/index.html').text();
	// Rewrite script/css paths to use Vite's @fs protocol
	const withVite = html
		.replace('src="./main.tsx"', 'src="/@fs${workbenchSrcDir}/main.tsx"')
		.replace('href="./styles.css"', 'href="/@fs${workbenchSrcDir}/styles.css"');
	return c.html(withVite);
});
`
			: `
// Workbench routes (production - serve pre-built assets)
// Use import.meta.dir for absolute paths (app.js runs from .agentuity/)
import { readFileSync, existsSync } from 'node:fs';
const workbenchIndexPath = import.meta.dir + '/workbench/index.html';
if (existsSync(workbenchIndexPath)) {
	const workbenchIndex = readFileSync(workbenchIndexPath, 'utf-8');
	app.get('${workbenchRoute}', (c: Context) => c.html(workbenchIndex));
	app.get('${workbenchRoute}/*', serveStatic({ root: import.meta.dir + '/workbench' }));
}
`
		: '';

	// Server startup (same for dev and prod - Bun.serve with native WebSocket)
	const serverStartup = `
// Start Bun server${isDev ? ' (dev mode with Vite asset proxy)' : ''}
if (typeof Bun !== 'undefined') {
	// Enable process exit protection now that we're starting the server
	enableProcessExitProtection();
	
	const port = parseInt(process.env.PORT || '3500', 10);
	const server = Bun.serve({
		fetch: app.fetch,
		websocket,
		port,
		hostname: '127.0.0.1',
	});
	
	// Make server available globally for health checks
	(globalThis as any).__AGENTUITY_SERVER__ = server;
	
	otel.logger.info(\`Server listening on http://127.0.0.1:\${port}\`);${isDev && vitePort ? `\n\totel.logger.debug(\`Proxying Vite assets from port ${vitePort}\`);` : ''}
}
`;

	const code = `// Auto-generated by Agentuity for ${mode} mode
// DO NOT EDIT - This file is regenerated on every build
${imports.join('\n')}

// Step 0: Bootstrap runtime environment (load profile-specific .env files)
// Only in development - production env vars are injected by platform
// This must happen BEFORE any imports that depend on environment variables
if (process.env.NODE_ENV !== 'production') {
	// Pass project directory (parent of .agentuity/) so .env files are loaded correctly
	await bootstrapRuntimeEnv({ projectDir: import.meta.dir + '/..' });
}

// Step 1: Initialize telemetry and services
const serverUrl = \`http://127.0.0.1:\${process.env.PORT || '3500'}\`;
const otel = register({ processors: [], logLevel: (process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel });

// Get app state and config for use below
const appState = getAppState();
const appConfig = getAppConfig();

createServices(otel.logger, appConfig, serverUrl);

// Make logger and tracer globally available for user's app.ts
setGlobalLogger(otel.logger);
setGlobalTracer(otel.tracer);

// Step 2: Create router and set as global
const app = createRouter();
setGlobalRouter(app);

// Step 3: Apply middleware in correct order (BEFORE mounting routes)
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
await import('../app.ts');

// Step 5: Initialize providers
const threadProvider = getThreadProvider();
const sessionProvider = getSessionProvider();

await threadProvider.initialize(appState);
await sessionProvider.initialize(appState);

// Step 6: Mount routes (AFTER middleware is applied)

// System health/idle endpoints
const healthHandler = (c: Context) => c.text('OK');
const idleHandler = (c: Context) => {
	// Check if server is idle (no pending requests/connections)
	const server = (globalThis as any).__AGENTUITY_SERVER__;
	if (!server) return c.text('NO', { status: 200 });
	
	// Check for pending background tasks
	if (hasWaitUntilPending()) return c.text('NO', { status: 200 });
	
	if (server.pendingRequests > 1) return c.text('NO', { status: 200 });
	if (server.pendingWebSockets > 0) return c.text('NO', { status: 200 });
	
	return c.text('OK', { status: 200 });
};

app.get('/_agentuity/health', healthHandler);
app.get('/_health', healthHandler);
app.get('/_agentuity/idle', idleHandler);
app.get('/_idle', idleHandler);

${assetProxyRoutes}
${apiMount}
${workbenchApiMount}
${workbenchRoutes}
${webRoutes}

// Step 7: Run agent setup to signal completion
await runAgentSetups(appState);

${serverStartup}
`;

	await Bun.write(entryPath, code);
	logger.trace(`Generated ${mode} mode entry file at %s`, entryPath);
}
