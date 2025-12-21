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
	SessionStartEvent,
} from '@agentuity/core';
import type { Email } from './io/email';
import type { ThreadProvider, SessionProvider, Session, Thread } from './session';
import type WaitUntilHandler from './_waituntil';
import type { Context } from 'hono';

type CorsOptions = Parameters<typeof cors>[0];
type HonoCompressOptions = Parameters<typeof compress>[0];

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

export interface AppConfig<TAppState = Record<string, never>> {
	/**
	 * Override the default cors settings
	 */
	cors?: CorsOptions;
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
}

export interface Variables<TAppState = Record<string, never>> {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
	email?: Email;
	sessionId: string;
	thread: Thread;
	session: Session;
	kv: KeyValueStorage;
	stream: StreamStorage;
	vector: VectorStorage;
	app: TAppState;
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

	// Get router from global (set by entry file before app.ts import)
	// In dev mode, router may not be available during bundling
	const globalRouter = getRouter();
	if (!globalRouter) {
		throw new Error(
			'Router is not available. Ensure router is initialized before calling createApp(). This typically happens during bundling or when the entry file has not properly set up the router.'
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
 * Run the global shutdown function
 * Called by generated entry file on cleanup
 */
export async function runShutdown(): Promise<void> {
	const shutdown = (globalThis as any).__AGENTUITY_SHUTDOWN__;
	if (shutdown) {
		const state = getAppState();
		await shutdown(state);
	}
}
