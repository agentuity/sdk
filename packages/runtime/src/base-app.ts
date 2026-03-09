/**
 * Base App - Standalone Hono application with all Agentuity middleware pre-configured
 *
 * This is for standalone usage OUTSIDE the Agentuity CLI pipeline (agentuity dev/build).
 * It bootstraps OTel, services, middleware, and the server lifecycle in a single call.
 *
 * Use this when you want to:
 * - Run an Agentuity-powered Hono server without the CLI build tool
 * - Embed Agentuity services in an existing Hono/Bun application
 * - Have full control over the server entry point
 *
 * If you're using the CLI (`agentuity dev` / `agentuity build`), use `createApp()` instead.
 * The CLI generates the entry file that handles bootstrapping for you.
 *
 * @example
 * ```typescript
 * // api/index.ts — traditional Hono router tree
 * import { createRouter } from '@agentuity/runtime';
 * import usersRouter from './users';
 * import authRouter from './auth';
 *
 * const router = createRouter();
 * router.route('/users', usersRouter);
 * router.route('/auth', authRouter);
 * router.get('/health', (c) => c.text('OK'));
 *
 * export default router;
 * ```
 *
 * @example
 * ```typescript
 * // server.ts — standalone entry point (NOT managed by CLI)
 * import { createBaseApp } from '@agentuity/runtime';
 * import router from './api';
 *
 * const app = await createBaseApp({
 *   router,
 *   setup: async () => {
 *     const db = await connectDB();
 *     return { db };
 *   },
 *   shutdown: async (state) => {
 *     await state.db.close();
 *   },
 * });
 *
 * // Start server manually
 * Bun.serve({ fetch: app.router.fetch, port: 3500 });
 * ```
 */

import type { LogLevel } from '@agentuity/core';
import type { AppConfig, Env } from './app';
import type { AppEventMap } from './_events';
import type { Logger } from './logger';
import type { Hono } from 'hono';

// Re-export Env so sub-routers can use the correct type
export type { Env } from './app';

export interface BaseAppResult<TAppState = Record<string, never>> {
	/**
	 * The root Hono app with all Agentuity middleware applied and the user router mounted.
	 */
	router: Hono<Env<TAppState>>;

	/**
	 * The application state returned from setup()
	 */
	state: TAppState;

	/**
	 * Logger instance for application-level logging
	 */
	logger: Logger;

	/**
	 * Server information
	 */
	server: { url: string };

	/**
	 * Add an event listener for app events
	 */
	addEventListener<K extends keyof AppEventMap<TAppState>>(
		eventName: K,
		callback: (eventName: K, ...args: AppEventMap<TAppState>[K]) => void | Promise<void>
	): void;

	/**
	 * Remove an event listener for app events
	 */
	removeEventListener<K extends keyof AppEventMap<TAppState>>(
		eventName: K,
		callback: (eventName: K, ...args: AppEventMap<TAppState>[K]) => void | Promise<void>
	): void;
}

export interface BaseAppConfig<TAppState = Record<string, never>> extends AppConfig<TAppState> {
	/**
	 * The user's Hono router to mount into the application.
	 *
	 * Build your routes as a normal Hono app, then pass the root router here.
	 * It will be mounted at `routePrefix` (default: `/api`) with all Agentuity
	 * middleware (CORS, OTel session tracking, agent context) applied to that prefix.
	 *
	 * @example
	 * ```typescript
	 * import { createRouter } from '@agentuity/runtime';
	 * import usersRouter from './api/users';
	 *
	 * const router = createRouter();
	 * router.route('/users', usersRouter);
	 * router.get('/health', (c) => c.text('OK'));
	 *
	 * const app = await createBaseApp({ router });
	 * // Routes are available at /api/users/*, /api/health
	 * ```
	 */
	router: Hono;

	/**
	 * The prefix under which the user router is mounted.
	 *
	 * All Agentuity middleware (CORS, OTel, agent context) is applied to `{routePrefix}/*`.
	 *
	 * @default '/api'
	 *
	 * @example
	 * ```typescript
	 * // Mount at root instead of /api
	 * const app = await createBaseApp({ router, routePrefix: '/' });
	 * ```
	 */
	routePrefix?: string;

	/**
	 * Whether to include the workbench routes (/_agentuity/workbench/*).
	 * @default true
	 */
	workbench?: boolean;

	/**
	 * Whether to include health check routes (/_agentuity/health, /_health, etc.).
	 * @default true
	 */
	healthChecks?: boolean;

	/**
	 * Port for the server. Defaults to PORT env var or 3500.
	 */
	port?: number;

	/**
	 * Log level for the runtime. Defaults to AGENTUITY_LOG_LEVEL env var or 'info'.
	 */
	logLevel?: LogLevel;
}

/**
 * Create a fully-configured Agentuity application from a user-provided Hono router.
 *
 * This is the simplified alternative to the file-based routing convention.
 * You build your route tree as a normal Hono app, then pass it here.
 * `createBaseApp` wraps it with all Agentuity infrastructure:
 *
 * 1. **Compression** — gzip/deflate response compression
 * 2. **Base middleware** — logger, tracer, meter, services (kv, stream, vector, etc.)
 * 3. **CORS** — on the route prefix (default: `/api/*`)
 * 4. **OTel session tracking** — on the route prefix (default: `/api/*`)
 * 5. **Agent context** — on the route prefix (default: `/api/*`)
 * 6. **User router** — mounted at the route prefix (default: `/api`)
 *
 * @template TAppState - Type of application state from setup()
 *
 * @example
 * ```typescript
 * // api/index.ts — build routes like a normal Hono app
 * import { createRouter } from '@agentuity/runtime';
 * import usersRouter from './users';
 *
 * const router = createRouter();
 * router.route('/users', usersRouter);
 * router.get('/health', (c) => c.text('OK'));
 * export default router;
 * ```
 *
 * ```typescript
 * // api/users.ts
 * import { createRouter } from '@agentuity/runtime';
 *
 * const router = createRouter();
 * router.get('/', (c) => c.json({ users: [] }));
 * router.get('/:id', (c) => c.json({ id: c.req.param('id') }));
 * router.post('/', async (c) => {
 *   const body = await c.req.json();
 *   return c.json({ created: body });
 * });
 * export default router;
 * ```
 *
 * ```typescript
 * // app.ts — wire it up
 * import { createBaseApp } from '@agentuity/runtime';
 * import router from './api';
 *
 * const app = await createBaseApp({
 *   router,
 *   setup: async () => {
 *     const db = await connectDB();
 *     return { db };
 *   },
 *   shutdown: async (state) => {
 *     await state.db.close();
 *   },
 * });
 * // Routes live at /api/users, /api/users/:id, /api/health
 * ```
 */
export async function createBaseApp<TAppState = Record<string, never>>(
	config: BaseAppConfig<TAppState>
): Promise<BaseAppResult<TAppState>> {
	const userRouter = config.router;
	const routePrefix = config.routePrefix ?? '/api';
	const middlewarePattern = routePrefix === '/' ? '*' : `${routePrefix}/*`;

	// Step 0: Bootstrap runtime environment
	const { bootstrapRuntimeEnv } = await import('./index');
	const isDev =
		process.env.NODE_ENV !== 'production' ||
		process.env.DEV === 'true' ||
		process.env.AGENTUITY_REGION === 'local';

	if (isDev) {
		bootstrapRuntimeEnv();
	}

	// Step 0.5: Load metadata and patch S3
	const { loadBuildMetadata } = await import('./_metadata');
	const { patchBunS3ForStorageDev } = await import('./bun-s3-patch');
	loadBuildMetadata();
	patchBunS3ForStorageDev();

	// Step 1: Initialize telemetry
	const { register } = await import('./otel/config');
	const { getSpanProcessors } = await import('./_server');
	const logLevel = (config.logLevel || process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel;
	const otel = register({ processors: getSpanProcessors(), logLevel });

	// Step 2: Create the root app and set as global
	const { createRouter } = await import('./router');
	const { setGlobalRouter, setGlobalLogger, setGlobalTracer } = await import('./_server');

	const app = createRouter() as Hono<Env<TAppState>>;
	setGlobalRouter(app);

	// Step 3: Run user setup
	const state = config.setup ? await config.setup() : ({} as TAppState);

	// Store state and config globally (for middleware and agent context to access)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_APP_STATE__ = state;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_APP_CONFIG__ = config;

	if (config.shutdown) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__AGENTUITY_SHUTDOWN__ = config.shutdown;
	}

	// Step 4: Initialize services
	const { createServices } = await import('./_services');
	const port = config.port || parseInt(process.env.PORT || '3500', 10);
	const serverUrl = `http://127.0.0.1:${port}`;
	createServices(otel.logger, config, serverUrl);

	// Make logger and tracer globally available
	setGlobalLogger(otel.logger);
	setGlobalTracer(otel.tracer);

	// Step 5: Initialize providers
	const { getThreadProvider, getSessionProvider } = await import('./_services');
	const threadProvider = getThreadProvider();
	const sessionProvider = getSessionProvider();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await threadProvider.initialize(state as any);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await sessionProvider.initialize(state as any);

	// Step 6: Apply middleware in correct order
	const {
		createBaseMiddleware,
		createCorsMiddleware,
		createOtelMiddleware,
		createCompressionMiddleware,
	} = await import('./middleware');
	const { createAgentMiddleware } = await import('./agent');

	// Compression (outermost — applies to all responses)
	app.use('*', createCompressionMiddleware());

	// Base middleware — logger, tracer, meter, services on all routes
	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	// CORS, OTel session tracking, agent context — on the user's route prefix
	app.use(middlewarePattern, createCorsMiddleware());
	app.use(middlewarePattern, createOtelMiddleware());
	app.use(middlewarePattern, createAgentMiddleware(''));

	// Step 7: Mount system routes (before user routes so they don't shadow system paths)

	// Workbench
	if (config.workbench !== false) {
		const { createWorkbenchRouter } = await import('./workbench');
		const workbenchRouter = createWorkbenchRouter();
		app.use('/_agentuity/workbench/*', createOtelMiddleware());
		app.route('/', workbenchRouter);
	}

	// Health checks
	if (config.healthChecks !== false) {
		const { hasWaitUntilPending } = await import('./_waituntil');

		app.get('/_agentuity/health', (c) =>
			c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' })
		);
		app.get('/_health', (c) =>
			c.text('OK', 200, { 'Content-Type': 'text/plain; charset=utf-8' })
		);
		app.get('/_agentuity/idle', (c) => {
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
		});
		app.get('/_idle', (c) => {
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
		});
	}

	// Step 8: Mount the user's router at the configured prefix
	app.route(routePrefix, userRouter);

	// Step 9: Run agent setups
	const { runAgentSetups } = await import('./agent');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await runAgentSetups(state as any);

	// Step 10: Create lazy logger proxy (same pattern as createApp)
	const { getLogger } = await import('./_server');
	const logger: Logger = {
		trace: (...args) => {
			const gl = getLogger();
			if (gl) gl.trace(...args);
		},
		debug: (...args) => {
			const gl = getLogger();
			if (gl) gl.debug(...args);
		},
		info: (...args) => {
			const gl = getLogger();
			if (gl) gl.info(...args);
			else console.log('[INFO]', ...args);
		},
		warn: (...args) => {
			const gl = getLogger();
			if (gl) gl.warn(...args);
			else console.warn('[WARN]', ...args);
		},
		error: (...args) => {
			const gl = getLogger();
			if (gl) gl.error(...args);
			else console.error('[ERROR]', ...args);
		},
		fatal: (...args): never => {
			const gl = getLogger();
			if (gl) return gl.fatal(...args);
			console.error('[FATAL]', ...args);
			throw new Error('Fatal error');
		},
		child: (bindings) => {
			const gl = getLogger();
			return gl ? gl.child(bindings) : logger;
		},
	};

	// Event listeners
	const {
		addEventListener: globalAddEventListener,
		removeEventListener: globalRemoveEventListener,
	} = await import('./_events');

	return {
		router: app,
		state,
		logger,
		server: { url: serverUrl },
		addEventListener: globalAddEventListener,
		removeEventListener: globalRemoveEventListener,
	};
}
