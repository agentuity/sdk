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

export interface AppConfig<TAppState = Record<string, never>> {
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
	 * Optional setup function called before server starts
	 * Returns app state that will be available in all agents and routes
	 */
	setup?: () => Promise<TAppState> | TAppState;
	/**
	 * Optional shutdown function called when server is stopping
	 * Receives the app state returned from setup
	 */
	shutdown?: (state: TAppState) => Promise<void> | void;

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
import {
	addEventListener as globalAddEventListener,
	removeEventListener as globalRemoveEventListener,
} from './_events';
import type { AppEventMap } from './_events';
import { getLogger, getRouter } from './_server';
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

export interface AppResult<TAppState = Record<string, never>> {
	/**
	 * The application state returned from setup
	 */
	state: TAppState;
	/**
	 * Shutdown function to call when server stops
	 */
	shutdown?: (state: TAppState) => Promise<void> | void;
	/**
	 * App configuration (for middleware setup)
	 */
	config?: AppConfig<TAppState>;
	/**
	 * The router instance (for backwards compatibility)
	 */
	router: import('hono').Hono<Env<TAppState>>;
	/**
	 * Server information (for backwards compatibility)
	 */
	server: Server;
	/**
	 * Logger instance (for backwards compatibility)
	 */
	logger: Logger;
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

/**
 * Create an Agentuity application with lifecycle management.
 *
 * In Vite-native architecture:
 * - This only handles setup/shutdown lifecycle
 * - Router creation and middleware are handled by the generated entry file
 * - Server is managed by Vite (dev) or Bun.serve (prod)
 *
 * @template TAppState - Type of application state from setup()
 *
 * @example
 * ```typescript
 * // app.ts
 * import { createApp } from '@agentuity/runtime';
 *
 * const app = await createApp({
 *   setup: async () => {
 *     const db = await connectDB();
 *     return { db };
 *   },
 *   shutdown: async (state) => {
 *     await state.db.close();
 *   }
 * });
 *
 * // Access state in agents via ctx.app.db
 * ```
 */
export async function createApp<TAppState = Record<string, never>>(
	config?: AppConfig<TAppState>
): Promise<AppResult<TAppState>> {
	// Run setup to get app state
	const state = config?.setup ? await config.setup() : ({} as TAppState);

	// Store state and config globally for generated entry file to access
	(globalThis as any).__AGENTUITY_APP_STATE__ = state;
	(globalThis as any).__AGENTUITY_APP_CONFIG__ = config;

	// Store user-provided router(s) normalized as RouteMount[] for the entry file.
	// When set, the entry file mounts these instead of auto-discovered route files.
	if (config?.router) {
		(globalThis as any).__AGENTUITY_USER_ROUTER__ = normalizeRouterConfig(config.router);
	}

	// Store shutdown function for cleanup
	const shutdown = config?.shutdown;
	if (shutdown) {
		(globalThis as any).__AGENTUITY_SHUTDOWN__ = shutdown;
	}

	// Return a logger proxy that lazily resolves to the global logger
	// This is necessary because Vite bundling inlines and reorders module code,
	// causing app.ts to execute before entry file sets the global logger.
	// The proxy ensures logger works correctly when actually used (in handlers/callbacks).
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
			// Fallback: log to console but let the real logger handle exit
			console.error('[FATAL]', ...args);
			throw new Error('Fatal error');
		},
		child: (bindings) => {
			const gl = getLogger();
			return gl ? gl.child(bindings) : logger;
		},
	};

	// Create server info from environment
	const port = process.env.PORT || '3500';
	const server: Server = {
		url: `http://127.0.0.1:${port}`,
	};

	// Get the global router (created by the entry file before app.ts import)
	const globalRouter = getRouter();
	if (!globalRouter) {
		throw new Error(
			'Router is not available. Ensure the entry file creates the router before importing app.ts.'
		);
	}
	const router = globalRouter as Hono<Env<TAppState>>;

	return {
		state,
		shutdown,
		config,
		router,
		server,
		logger,
		addEventListener: globalAddEventListener,
		removeEventListener: globalRemoveEventListener,
	};
}

/**
 * Get the global app state
 * Used by generated entry file and middleware
 */
export function getAppState<TAppState = any>(): TAppState {
	return (globalThis as any).__AGENTUITY_APP_STATE__ || ({} as TAppState);
}

/**
 * Get the global app config
 * Used by generated entry file for middleware setup
 */
export function getAppConfig<TAppState = any>(): AppConfig<TAppState> | undefined {
	return (globalThis as any).__AGENTUITY_APP_CONFIG__;
}

/**
 * Normalize the router config into a consistent RouteMount[] form.
 * - Plain Hono → [{ path: '/api', router }]
 * - { path, router } → [{ path, router }]
 * - [{ path, router }, ...] → as-is
 * @internal
 */
function normalizeRouterConfig(
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
 * Get the user-provided router mounts from createApp({ router }).
 * Returns undefined if no user router was provided (file-based routing).
 * Used by generated entry file to skip file-based route discovery.
 * @internal
 */
export function getUserRouter(): RouteMount[] | undefined {
	return (globalThis as any).__AGENTUITY_USER_ROUTER__;
}

/**
 * Set the global app config (for testing purposes)
 * @internal
 */
export function setAppConfig<TAppState = any>(config: AppConfig<TAppState> | undefined): void {
	if (config === undefined) {
		delete (globalThis as any).__AGENTUITY_APP_CONFIG__;
	} else {
		(globalThis as any).__AGENTUITY_APP_CONFIG__ = config;
	}
}

/**
 * Symbol used to store shutdown hooks in globalThis.
 */
const SHUTDOWN_HOOKS_KEY = Symbol.for('@agentuity/runtime:shutdown-hooks');

/**
 * A shutdown hook function.
 */
export type ShutdownHook = () => Promise<void> | void;

/**
 * Gets the global shutdown hooks registry.
 */
function getShutdownHooks(): ShutdownHook[] {
	const global = globalThis as Record<symbol, ShutdownHook[]>;
	if (!global[SHUTDOWN_HOOKS_KEY]) {
		global[SHUTDOWN_HOOKS_KEY] = [];
	}
	return global[SHUTDOWN_HOOKS_KEY];
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
 * Run the global shutdown function and all registered shutdown hooks.
 * Called by generated entry file on cleanup.
 *
 * Shutdown order:
 * 1. App's shutdown callback (if defined)
 * 2. Registered shutdown hooks (in reverse order - LIFO)
 */
export async function runShutdown(): Promise<void> {
	// Run app's shutdown callback first
	const shutdown = (globalThis as any).__AGENTUITY_SHUTDOWN__;
	if (shutdown) {
		const state = getAppState();
		await shutdown(state);
	}

	// Run registered shutdown hooks in reverse order (LIFO)
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
