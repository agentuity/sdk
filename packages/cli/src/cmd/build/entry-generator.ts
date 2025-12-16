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
}

/**
 * Generate entry file with clean Vite-native architecture
 */
export async function generateEntryFile(options: GenerateEntryOptions): Promise<void> {
	const { rootDir, projectId, deploymentId, logger, mode, workbench } = options;
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
	];

	if (hasWorkbench) {
		runtimeImports.push(`  createWorkbenchRouter,`);
	}

	const imports = [
		`import { `,
		...runtimeImports,
		`} from '@agentuity/runtime';`,
		isDev ? `import { createNodeWebSocket } from '@hono/node-ws';` : `import { websocket } from 'hono/bun';`,
		!isDev && hasWebFrontend ? `import { serveStatic } from 'hono/bun';` : '',
	].filter(Boolean);

	imports.push(`import { type LogLevel } from '@agentuity/core';`);

	// HMR setup (dev only)
	const hmrSetup = isDev
		? `
// HMR restart handler
if (typeof globalThis.__AGENTUITY_RESTART__ === 'undefined') {
	globalThis.__AGENTUITY_RESTART__ = () => {
		console.log('[HMR] Restart triggered but handler not ready yet');
	};
}
`
		: '';

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

	// Web routes (different for dev/prod)
	let webRoutes = '';
	if (hasWebFrontend) {
		if (isDev) {
			const htmlPath = join(srcDir, 'web', 'index.html');
			webRoutes = `
// Web routes (dev mode with Vite HMR)
const devHtmlHandler = async (c) => {
	const html = await Bun.file('${htmlPath}').text();
	const withHmr = html
		// Fix relative paths to absolute for Vite dev server (with or without ./)
		.replace(/src=["'](?:\\.\\/)?([^"'\\/]+\\.tsx?)["']/g, 'src="/src/web/$1"')
		// Inject Vite HMR scripts
		.replace(
			'</head>',
			\`<script type="module">
				import RefreshRuntime from '/@react-refresh'
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
			</script>
			<script type="module" src="/@vite/client"></script>
			</head>\`
		);
	return c.html(withHmr);
};
app.get('/', devHtmlHandler);
// 404 for unmatched API/system routes
app.all('/_agentuity/*', (c) => c.notFound());
app.all('/api/*', (c) => c.notFound());
${hasWorkbench ? '' : `app.all('/workbench/*', (c) => c.notFound());`}
// SPA fallback - serve index.html for all other GET requests
// This is last so user routes, API routes, and workbench routes match first
app.get('*', devHtmlHandler);
`;
		} else {
			webRoutes = `
// Web routes (production - static files)
app.use('/assets/*', serveStatic({ root: './.agentuity/client' }));
app.get('/', serveStatic({ path: './.agentuity/client/index.html' }));
// 404 for unmatched API/system routes
app.all('/_agentuity/*', (c) => c.notFound());
app.all('/api/*', (c) => c.notFound());
${hasWorkbench ? '' : `app.all('/workbench/*', (c) => c.notFound());`}
// SPA fallback - serve index.html for all other GET requests
// This is last so user routes, API routes, and workbench routes match first
app.get('*', serveStatic({ path: './.agentuity/client/index.html' }));
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
app.get('${workbenchRoute}', async (c) => {
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
import { readFileSync, existsSync } from 'node:fs';
const workbenchIndexPath = '${join(agentuityDir, 'workbench')}/index.html';
if (existsSync(workbenchIndexPath)) {
	const workbenchIndex = readFileSync(workbenchIndexPath, 'utf-8');
	app.get('${workbenchRoute}', (c) => c.html(workbenchIndex));
	app.get('${workbenchRoute}/*', serveStatic({ root: '${join(agentuityDir, 'workbench')}' }));
}
`
		: '';

	// Server startup
	const serverStartup = isDev
		? `
// Dev mode: Attach to externally-started HTTP server (from vite-dev-server.ts)
if (globalThis.__AGENTUITY_WS_HTTP_SERVER__ && !globalThis.__AGENTUITY_WS_ATTACHED__) {
	otel.logger.debug('🔌 Attaching Hono app to existing HTTP server...');
	const nodeServer = await import('@hono/node-server');
	const nodeWs = await import('@hono/node-ws');
	
	// Get the HTTP request listener from Hono app
	const httpServer = globalThis.__AGENTUITY_WS_HTTP_SERVER__;
	
	otel.logger.debug('Creating request listener from Hono app...');
	const requestListener = nodeServer.getRequestListener(app.fetch);
	
	otel.logger.debug('Creating WebSocket injector...');
	const { injectWebSocket } = nodeWs.createNodeWebSocket({ app });
	
	// Attach request handler to existing server
	otel.logger.debug('Attaching request handler to HTTP server...');
	httpServer.on('request', requestListener);
	
	// Inject WebSocket support
	otel.logger.debug('Injecting WebSocket support into HTTP server...');
	injectWebSocket(httpServer);
	
	// Mark as attached to prevent re-attachment on HMR
	globalThis.__AGENTUITY_WS_ATTACHED__ = true;
	
	otel.logger.info('✅ Attached app to existing WebSocket server on port 3501');
	
	// Log upgrade event listeners for debugging
	const upgradeListeners = httpServer.listeners('upgrade');
	otel.logger.debug(\`HTTP Server has \${upgradeListeners.length} upgrade listeners\`);
} else if (globalThis.__AGENTUITY_WS_ATTACHED__) {
	otel.logger.debug('ℹ️ Skipping attachment - already attached (HMR reload)');
}
`
		: `
// Start Bun server for production
if (typeof Bun !== 'undefined') {
	const port = parseInt(process.env.PORT || '3500', 10);
	Bun.serve({
		fetch: app.fetch,
		websocket,
		port,
		hostname: '127.0.0.1',
	});
	otel.logger.info(\`Server listening on http://127.0.0.1:\${port}\`);
}
`;

	const code = `// Auto-generated by Agentuity for ${mode} mode
// DO NOT EDIT - This file is regenerated on every build

${imports.join('\n')}

${hmrSetup}

// Step 1: Enable process exit protection
enableProcessExitProtection();

// Step 2: Initialize telemetry and services
const serverUrl = \`http://127.0.0.1:\${process.env.PORT || '3500'}\`;
const otel = register({ processors: [], logLevel: (process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel });
const servicesResult = createServices(otel.logger, undefined, serverUrl);

// Make logger and tracer globally available for user's app.ts
setGlobalLogger(otel.logger);
setGlobalTracer(otel.tracer);

// Step 2: Create router and set as global
${isDev ? `// Dev mode: Set upgradeWebSocket globally before router creation
const nodeWs = (await import('@hono/node-ws')).createNodeWebSocket({ app: undefined });
globalThis.__AGENTUITY_UPGRADE_WEBSOCKET__ = nodeWs.upgradeWebSocket;
` : `// Production: Set upgradeWebSocket from hono/bun
const { upgradeWebSocket } = await import('hono/bun');
globalThis.__AGENTUITY_UPGRADE_WEBSOCKET__ = upgradeWebSocket;
`}const app = createRouter();
${isDev ? `\n// Dev mode: Reinitialize with actual app for injectWebSocket\nconst { injectWebSocket } = (await import('@hono/node-ws')).createNodeWebSocket({ app });\n` : ''}
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

// Get app state and config for use below
const appState = getAppState();
const appConfig = getAppConfig();

// Step 5: Initialize providers
const threadProvider = getThreadProvider();
const sessionProvider = getSessionProvider();

await threadProvider.initialize(appState);
await sessionProvider.initialize(appState);

// Step 6: Mount routes (AFTER middleware is applied)
${apiMount}
${workbenchApiMount}
${workbenchRoutes}
${webRoutes}

// Step 7: Run agent setup to signal completion
await runAgentSetups(appState);

export default app;

${serverStartup}
`;

	await Bun.write(entryPath, code);
	logger.trace(`Generated ${mode} mode entry file at %s`, entryPath);
}
