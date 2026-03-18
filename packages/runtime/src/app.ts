/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Env as HonoEnv } from 'hono';
import type { cors } from 'hono/cors';
import type { compress } from 'hono/compress';
import type { Logger } from './logger';
import type { Meter, Tracer } from '@opentelemetry/api';
import type {
	KeyValueStorage,
	SessionEventProvider,
	EvalRunEventProvider,
	StreamStorage,
	VectorStorage,
	SandboxService,
	QueueService,
	EmailService,
	ScheduleService,
	TaskStorage,
	SessionStartEvent,
} from '@agentuity/core';

import type { ThreadProvider, SessionProvider, Session, Thread } from './session';
import type WaitUntilHandler from './_waituntil';
import type { Context } from 'hono';

type HonoCorsOptions = NonNullable<Parameters<typeof cors>[0]>;
type HonoCompressOptions = Parameters<typeof compress>[0];

/**
 * Agentuity-specific CORS options for same-origin restriction.
 */
export interface AgentuityCorsSameOriginOptions {
	/**
	 * Enable same-origin restriction for CORS.
	 *
	 * When true, only allows origins from:
	 * - AGENTUITY_BASE_URL environment variable
	 * - AGENTUITY_CLOUD_DOMAINS environment variable (comma-separated)
	 * - AUTH_TRUSTED_DOMAINS environment variable (comma-separated)
	 * - The same-origin of the incoming request URL
	 * - Any additional origins specified in `allowedOrigins`
	 *
	 * When false or omitted, the default behavior is to reflect any origin
	 * (backwards compatible).
	 *
	 * @default false
	 */
	sameOrigin?: boolean;

	/**
	 * Additional origins to allow when `sameOrigin` is true.
	 * Can be full URLs (https://example.com) or bare domains (example.com).
	 *
	 * These are merged with the origins derived from environment variables.
	 */
	allowedOrigins?: string[];
}

/**
 * Extended CORS configuration options.
 *
 * Combines Hono's CORS options with Agentuity-specific settings for
 * easy same-origin restriction.
 *
 * @example
 * ```typescript
 * // Simple opt-in to trusted origins only
 * const app = await createApp({
 *   cors: { sameOrigin: true }
 * });
 *
 * // With additional allowed origins
 * const app = await createApp({
 *   cors: {
 *     sameOrigin: true,
 *     allowedOrigins: ['https://admin.myapp.com'],
 *   }
 * });
 * ```
 */
export type CorsConfig = HonoCorsOptions & AgentuityCorsSameOriginOptions;

/**
 * Configuration options for response compression middleware.
 *
 * @example
 * ```typescript
 * const app = await createApp({
 *   compression: {
 *     enabled: true,
 *     threshold: 1024,
 *   }
 * });
 * ```
 */
export interface CompressionConfig {
	/**
	 * Enable or disable compression globally.
	 * @default true
	 */
	enabled?: boolean;

	/**
	 * Minimum response body size in bytes before compression is attempted.
	 * Responses smaller than this threshold will not be compressed.
	 * @default 1024
	 */
	threshold?: number;

	/**
	 * Optional filter function to skip compression for specific requests.
	 * Return false to skip compression for the request.
	 *
	 * @example
	 * ```typescript
	 * filter: (c) => !c.req.path.startsWith('/internal')
	 * ```
	 */
	filter?: (c: Context) => boolean;

	/**
	 * Raw options passed through to Hono's compress middleware.
	 * These are merged with Agentuity's defaults.
	 */
	honoOptions?: HonoCompressOptions;
}

/**
 * Web analytics configuration options.
 */
export interface AnalyticsOptions {
	/** Enable/disable analytics @default true */
	enabled?: boolean;
	/** Require explicit user consent before tracking @default false */
	requireConsent?: boolean;
	/** Track click events on elements with data-analytics attribute @default true */
	trackClicks?: boolean;
	/** Track scroll depth @default true */
	trackScroll?: boolean;
	/** Track outbound link clicks @default true */
	trackOutboundLinks?: boolean;
	/** Track form submissions @default false */
	trackForms?: boolean;
	/** Track Core Web Vitals (LCP, FID, CLS) @default true */
	trackWebVitals?: boolean;
	/** Track JavaScript errors @default true */
	trackErrors?: boolean;
	/** Track SPA navigation changes @default true */
	trackSPANavigation?: boolean;
	/** Sampling rate (0-1) @default 1 */
	sampleRate?: number;
	/** URL patterns to exclude from tracking */
	excludePatterns?: string[];
	/** Global properties attached to every event */
	globalProperties?: Record<string, unknown>;
}

/**
 * Workbench UI configuration options.
 */
export interface WorkbenchOptions {
	/** Route path for the workbench UI @default '/workbench' */
	route?: string;
	/** Custom headers to include in workbench responses */
	headers?: Record<string, string>;
}

export interface AppConfig {
	/**
	 * Configure CORS (Cross-Origin Resource Sharing) settings.
	 *
	 * By default, CORS reflects any origin (backwards compatible).
	 * Use `sameOrigin: true` to restrict to trusted origins only.
	 *
	 * @example
	 * ```typescript
	 * // Restrict to trusted origins (recommended for production)
	 * const app = await createApp({
	 *   cors: { sameOrigin: true }
	 * });
	 *
	 * // Add additional allowed origins
	 * const app = await createApp({
	 *   cors: {
	 *     sameOrigin: true,
	 *     allowedOrigins: ['https://admin.myapp.com'],
	 *   }
	 * });
	 * ```
	 */
	cors?: CorsConfig;
	/**
	 * Configure response compression.
	 * Set to `false` to disable compression entirely.
	 *
	 * @example
	 * ```typescript
	 * const app = await createApp({
	 *   compression: {
	 *     threshold: 2048,
	 *   }
	 * });
	 *
	 * // Or disable compression:
	 * const app = await createApp({ compression: false });
	 * ```
	 */
	compression?: CompressionConfig | false;
	/**
	 * Override the default services
	 */
	services?: {
		/**
		 * if true (default false), will use local services and override any others
		 */
		useLocal?: boolean;
		/**
		 * the KeyValueStorage to override instead of the default
		 */
		keyvalue?: KeyValueStorage;
		/**
		 * the StreamStorage to override instead of the default
		 */
		stream?: StreamStorage;
		/**
		 * the VectorStorage to override instead of the default
		 */
		vector?: VectorStorage;
		/**
		 * the TaskStorage to override instead of the default
		 */
		task?: TaskStorage;
		/**
		 * the ThreadProvider to override instead of the default
		 */
		thread?: ThreadProvider;
		/**
		 * the SessionProvider to override instead of the default
		 */
		session?: SessionProvider;
		/**
		 * the SessionEventProvider to override instead of the default
		 */
		sessionEvent?: SessionEventProvider;
		/**
		 * the EvalRunEventProvider to override instead of the default
		 */
		evalRunEvent?: EvalRunEventProvider;
		/**
		 * the EmailService to override instead of the default
		 */
		email?: EmailService;
	};
	/**
	 * Optional request timeout in seconds. If not provided, will default
	 * to zero which will cause the request to wait indefinitely.
	 */
	requestTimeout?: number;

	/**
	 * Configure web analytics for frontend tracking.
	 *
	 * Set to `true` to enable with defaults, `false` to disable, or provide
	 * a configuration object to customize tracking behavior.
	 *
	 * @default true
	 *
	 * @example
	 * ```typescript
	 * // Enable with defaults
	 * const app = await createApp({ analytics: true });
	 *
	 * // Disable analytics
	 * const app = await createApp({ analytics: false });
	 *
	 * // Custom configuration
	 * const app = await createApp({
	 *   analytics: {
	 *     trackClicks: false,
	 *     sampleRate: 0.5,
	 *   }
	 * });
	 * ```
	 */
	analytics?: boolean | AnalyticsOptions;

	/**
	 * Configure the workbench UI for agent testing.
	 *
	 * Set to `true` to enable at `/workbench`, a string to set a custom route,
	 * or an object for full configuration. Only active in development mode.
	 *
	 * @example
	 * ```typescript
	 * // Enable at default route (/workbench)
	 * const app = await createApp({ workbench: true });
	 *
	 * // Custom route
	 * const app = await createApp({ workbench: '/debug' });
	 *
	 * // Full configuration
	 * const app = await createApp({
	 *   workbench: {
	 *     route: '/debug',
	 *     headers: { 'X-Custom': 'value' },
	 *   }
	 * });
	 * ```
	 */
	workbench?: boolean | string | WorkbenchOptions;

	/**
	 * **Experimental** — Optional user-provided router(s) to use instead of file-based routing.
	 *
	 * When provided, the CLI's generated entry file mounts these routers instead
	 * of auto-discovering individual route files from `src/api/`. All Agentuity
	 * middleware (CORS, OTel, agent context) is applied to each mount path.
	 *
	 * Accepts three forms:
	 * - A plain `Hono` instance → mounted at `/api` (default)
	 * - A `{ path, router }` object → mounted at the specified path
	 * - An array of `{ path, router }` objects → each mounted at its path
	 *
	 * Use `createRouter()` to get typed access to Agentuity context variables
	 * (`c.var.logger`, `c.var.thread`, `c.var.session`, etc.), or use
	 * `new Hono<Env>()` for the same types with a plain Hono instance.
	 *
	 * @experimental This API may change in future releases.
	 *
	 * @example Single router (mounted at /api)
	 * ```typescript
	 * const router = createRouter();
	 * router.route('/users', usersRouter);
	 * export const app = await createApp({ router });
	 * ```
	 *
	 * @example Single router at custom path
	 * ```typescript
	 * const router = createRouter();
	 * router.route('/users', usersRouter);
	 * export const app = await createApp({
	 *   router: { path: '/v1', router },
	 * });
	 * ```
	 *
	 * @example Multiple routers at different paths
	 * ```typescript
	 * export const app = await createApp({
	 *   router: [
	 *     { path: '/api/v1', router: v1Router },
	 *     { path: '/api/v2', router: v2Router },
	 *   ],
	 * });
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	router?: import('hono').Hono<any, any, any> | RouteMount | RouteMount[];

	/**
	 * Agents to register with this application.
	 *
	 * Each agent is a value returned by `createAgent()`. Importing the agent
	 * module triggers self-registration; listing them here ensures they are
	 * included in the build and available for workbench metadata, setup/shutdown
	 * lifecycle, and agent-to-agent calls via `ctx.invoke()`.
	 *
	 * Type safety for agent calls comes from direct imports — use
	 * `ctx.invoke(() => myAgent.run(input))` for fully typed invocations.
	 *
	 * @example
	 * ```typescript
	 * import greeting from './agent/greeting/agent';
	 * import session from './agent/session/agent';
	 *
	 * export default await createApp({
	 *   agents: [greeting, session],
	 *   router,
	 * });
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	agents?: import('./agent').AgentRunner<any, any, any>[];
}

/**
 * A user-provided router with its mount path.
 *
 * @experimental This API may change in future releases.
 */
export interface RouteMount {
	/**
	 * The base path to mount the router at (e.g. `/api`, `/api/v1`).
	 * Agentuity middleware (CORS, OTel, agent context) is applied to `{path}/*`.
	 */
	path: string;
	/**
	 * The Hono router to mount.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	router: import('hono').Hono<any, any, any>;
}

export interface Variables<TAppState = Record<string, never>> {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
	sessionId: string;
	thread: Thread;
	session: Session;
	kv: KeyValueStorage;
	stream: StreamStorage;
	vector: VectorStorage;
	sandbox: SandboxService;
	queue: QueueService;
	email: EmailService;
	schedule: ScheduleService;
	task: TaskStorage;
	app: TAppState;
	// Web analytics context (set by createWebSessionMiddleware, thread-only tracking)
	_webThreadId?: string;
}

export type TriggerType = SessionStartEvent['trigger'];

export interface PrivateVariables {
	waitUntilHandler: WaitUntilHandler;
	routeId?: string;
	agentIds: Set<string>;
	trigger: TriggerType;
	agentRunSpanId?: string;
}

export interface Env<TAppState = Record<string, never>> extends HonoEnv {
	Variables: Variables<TAppState>;
}

/**
 * Get the global app instance (stub for backwards compatibility)
 * Returns null in Vite-native architecture
 */
export function getApp(): null {
	return null;
}

// Re-export event functions from _events
export { fireEvent } from './_events';

import type { Hono } from 'hono';

// ============================================================================
// Vite-native createApp implementation
// ============================================================================

/**
 * Simple server interface for backwards compatibility
 */
export interface Server {
	/**
	 * The server URL (e.g., "http://localhost:3500")
	 */
	url: string;
}

export interface AppResult {
	/**
	 * App configuration
	 */
	config?: AppConfig;
	/**
	 * The Hono router instance
	 */
	router: import('hono').Hono<Env>;
	/**
	 * Server information
	 */
	server: Server;
	/**
	 * Logger instance
	 */
	logger: Logger;
	/**
	 * Fetch handler for the application.
	 * Bun --hot uses this on the default export to hot-swap the running server's
	 * request handler without restarting the process.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	fetch: (req: Request, ...args: any[]) => Response | Promise<Response>;
	/**
	 * Port the server listens on.
	 * Used by Bun --hot alongside `fetch` to configure the server.
	 */
	port: number;
	/**
	 * Hostname the server binds to.
	 */
	hostname: string;
}

/**
 * Create and start an Agentuity application.
 *
 * This is the single entry point for the entire server lifecycle:
 * OTel, middleware, route mounting, services, and Bun.serve().
 *
 * @example
 * ```typescript
 * import { createApp } from '@agentuity/runtime';
 * import router from './src/api/router';
 * import agents from './src/agent';
 *
 * export default await createApp({
 *   router: { path: '/api', router },
 *   agents,
 * });
 * ```
 */
export async function createApp(config?: AppConfig): Promise<AppResult> {
	// --- Imports (lazy to avoid circular deps) ---
	const { bootstrapRuntimeEnv } = await import('@agentuity/server');
	const { register } = await import('./otel/config');
	const { setGlobalLogger, setGlobalTracer, setGlobalRouter, getSpanProcessors } = await import(
		'./_server'
	);
	const { createServices, getThreadProvider, getSessionProvider } = await import('./_services');
	const {
		createBaseMiddleware,
		createCorsMiddleware,
		createOtelMiddleware,
		createCompressionMiddleware,
	} = await import('./middleware');
	const { runAgentSetups, createAgentMiddleware } = await import('./agent');
	const { loadBuildMetadata } = await import('./_metadata');
	const { patchBunS3ForStorageDev } = await import('./bun-s3-patch');
	const { createWorkbenchRouter } = await import('./workbench');
	const {
		isDevelopment,
		resolveAnalyticsConfig,
		resolveWorkbenchConfig,
		registerHealthRoutes,
		registerAnalyticsRoutes,
		registerWebRoutes,
		registerWorkbenchUI,
		startServer,
	} = await import('./bootstrap');

	// --- Step 0: Environment ---
	if (isDevelopment()) {
		bootstrapRuntimeEnv();
	}
	if (isDevelopment() && process.env.AGENTUITY_NO_BUNDLE === 'true') {
		const { applyDevPatches } = await import('./dev-patches');
		await applyDevPatches();
	}
	loadBuildMetadata();
	patchBunS3ForStorageDev();

	// --- Step 1: Telemetry ---
	const otel = register({
		processors: getSpanProcessors(),
		logLevel: (process.env.AGENTUITY_LOG_LEVEL || 'info') as import('@agentuity/core').LogLevel,
	});
	setGlobalLogger(otel.logger);
	setGlobalTracer(otel.tracer);

	// --- Step 2: Router + middleware ---
	const { createRouter } = await import('./router');
	const app = createRouter();
	setGlobalRouter(app);

	app.use('*', createCompressionMiddleware(config?.compression));
	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);
	app.use('/_agentuity/workbench/*', createOtelMiddleware());

	// --- Step 3: Services ---
	const port = process.env.PORT || '3500';
	const serverUrl = `http://127.0.0.1:${port}`;
	createServices(otel.logger, config, serverUrl);

	const threadProvider = getThreadProvider();
	const sessionProvider = getSessionProvider();
	await threadProvider.initialize({});
	await sessionProvider.initialize({});

	// --- Step 4: Routes ---
	const analyticsConfig = resolveAnalyticsConfig(config?.analytics);
	const workbenchConfig = resolveWorkbenchConfig(config?.workbench);

	registerHealthRoutes(app);

	if (analyticsConfig.enabled) {
		registerAnalyticsRoutes(app, analyticsConfig);
	}

	// Mount user routers
	if (config?.router) {
		const mounts = normalizeRouterConfig(config.router);
		for (const mount of mounts) {
			const prefix = mount.path.endsWith('/') ? mount.path + '*' : mount.path + '/*';
			app.use(prefix, createCorsMiddleware(config?.cors));
			app.use(prefix, createOtelMiddleware());
			app.use(prefix, createAgentMiddleware(''));
			app.route(mount.path, mount.router);
		}
	}

	// Workbench
	const workbenchRouter = createWorkbenchRouter();
	app.route('/', workbenchRouter);
	registerWorkbenchUI(app, workbenchConfig);

	// Web (production static serving)
	registerWebRoutes(app, analyticsConfig);

	// --- Step 5: Agent lifecycle + server ---
	await runAgentSetups({});

	// In dev mode with --hot, Bun manages the server via the default export's
	// `fetch` property. In production, we start Bun.serve() explicitly.
	if (!isDevelopment()) {
		startServer(app, { requestTimeout: config?.requestTimeout });
	}

	// Only log on first startup, not on --hot reloads
	const { serverStarted } = await import('./_globals');
	if (!serverStarted.get()) {
		serverStarted.set(true);
		otel.logger.debug('Server listening on %s', serverUrl);
	}

	const portNumber = parseInt(port, 10);

	const result: AppResult = {
		config,
		router: app as Hono<Env>,
		server: { url: serverUrl },
		logger: otel.logger,
		// Bun --hot picks up `fetch` and `port` on the default export to
		// hot-swap the running server's request handler without restarting.
		fetch: app.fetch,
		port: portNumber,
		hostname: '127.0.0.1',
	};

	// In production, startServer() already called Bun.serve(). If we leave
	// `fetch` + `port` on the default export, Bun v1.2+ auto-serves from it
	// too — causing EADDRINUSE. Strip those properties so only the explicit
	// Bun.serve() is active.
	if (!isDevelopment()) {
		delete (result as unknown as Record<string, unknown>).fetch;
		delete (result as unknown as Record<string, unknown>).port;
		delete (result as unknown as Record<string, unknown>).hostname;
	}

	return result;
}

/**
 * Normalize the router config into a consistent RouteMount[] form.
 * - Plain Hono → [{ path: '/api', router }]
 * - { path, router } → [{ path, router }]
 * - [{ path, router }, ...] → as-is
 * @internal
 */
export function normalizeRouterConfig(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	router: import('hono').Hono<any, any, any> | RouteMount | RouteMount[]
): RouteMount[] {
	if (Array.isArray(router)) {
		return router;
	}
	if ('router' in router && 'path' in router) {
		return [router as RouteMount];
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return [{ path: '/api', router: router as import('hono').Hono<any, any, any> }];
}

/**
 * A shutdown hook function.
 */
export type ShutdownHook = () => Promise<void> | void;

/**
 * Gets the global shutdown hooks registry.
 */
function getShutdownHooks(): ShutdownHook[] {
	const key = Symbol.for('@agentuity/runtime:shutdown-hooks');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const g = globalThis as any;
	if (!g[key]) {
		g[key] = [];
	}
	return g[key];
}

/**
 * Registers a shutdown hook to be called during graceful shutdown.
 *
 * Hooks are called in reverse order of registration (LIFO) after the
 * app's shutdown callback and agent shutdowns have completed.
 *
 * This is useful for packages like @agentuity/postgres to register
 * their own cleanup logic without requiring explicit wiring in each app.
 *
 * @param hook - The function to call during shutdown
 * @returns A function to unregister the hook
 *
 * @example
 * ```typescript
 * import { registerShutdownHook } from '@agentuity/runtime';
 *
 * // Register a cleanup function
 * const unregister = registerShutdownHook(async () => {
 *   await myResource.close();
 * });
 *
 * // Later, if needed, unregister it
 * unregister();
 * ```
 */
export function registerShutdownHook(hook: ShutdownHook): () => void {
	const hooks = getShutdownHooks();
	hooks.push(hook);

	return () => {
		const index = hooks.indexOf(hook);
		if (index !== -1) {
			hooks.splice(index, 1);
		}
	};
}

/**
 * Run all registered shutdown hooks.
 * Called during graceful shutdown (SIGTERM/SIGINT).
 *
 * Hooks are called in reverse order of registration (LIFO).
 */
export async function runShutdown(): Promise<void> {
	const hooks = getShutdownHooks();
	for (let i = hooks.length - 1; i >= 0; i--) {
		const hook = hooks[i];
		if (!hook) continue;
		try {
			await hook();
		} catch {
			// Ignore errors during shutdown hooks
		}
	}
}
