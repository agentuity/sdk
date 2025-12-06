/* eslint-disable @typescript-eslint/no-explicit-any */
/** biome-ignore-all lint/suspicious/noExplicitAny: any are ok */
import { type Env as HonoEnv, Hono } from 'hono';
import type { cors } from 'hono/cors';
import type { BunWebSocketData } from 'hono/bun';
import type { Logger } from './logger';
import { createServer, getLogger } from './_server';
import type { Meter, Tracer } from '@opentelemetry/api';
import { internal } from './logger/internal';
import type {
	KeyValueStorage,
	SessionEventProvider,
	EvalRunEventProvider,
	StreamStorage,
	VectorStorage,
	SessionStartEvent,
} from '@agentuity/core';
import type { Email } from './io/email';
import type { Agent, AgentContext } from './agent';
import type { ThreadProvider, SessionProvider, Session, Thread } from './session';
import type WaitUntilHandler from './_waituntil';

// TODO: This should be imported from workbench package, but causes circular dependency
export interface WorkbenchInstance {
	config: { route?: string; headers?: Record<string, string> };
}

type CorsOptions = Parameters<typeof cors>[0];

export interface AppConfig<TAppState = Record<string, never>> {
	/**
	 * Override the default cors settings
	 */
	cors?: CorsOptions;
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
		/**
		 * the Workbench to override instead of the default
		 */
		workbench?: WorkbenchInstance;
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
}

export interface Env<TAppState = Record<string, never>> extends HonoEnv {
	Variables: Variables<TAppState>;
}

type AppEventMap<TAppState = Record<string, never>> = {
	'agent.started': [Agent<any, any, any, any, TAppState>, AgentContext<any, any, TAppState>];
	'agent.completed': [Agent<any, any, any, any, TAppState>, AgentContext<any, any, TAppState>];
	'agent.errored': [
		Agent<any, any, any, any, TAppState>,
		AgentContext<any, any, TAppState>,
		Error,
	];
	'session.started': [Session];
	'session.completed': [Session];
	'thread.created': [Thread];
	'thread.destroyed': [Thread];
};

type AppEventCallback<K extends keyof AppEventMap<any>, TAppState = Record<string, never>> = (
	eventName: K,
	...args: AppEventMap<TAppState>[K]
) => void | Promise<void>;

/**
 * Main application instance created by createApp().
 * Provides access to the router, server, logger, and app state.
 *
 * @template TAppState - The type of application state returned from setup function
 *
 * @example
 * ```typescript
 * const app = await createApp({
 *   setup: async () => ({ db: await connectDB() })
 * });
 *
 * // Access state
 * console.log(app.state.db);
 *
 * // Add routes
 * app.router.get('/health', (c) => c.text('OK'));
 *
 * // Listen to events
 * app.addEventListener('agent.started', (eventName, agent, ctx) => {
 *   console.log(`Agent ${agent.metadata.name} started`);
 * });
 * ```
 */
export class App<TAppState = Record<string, never>> {
	/**
	 * The Hono router instance for defining routes.
	 */
	readonly router: Hono<Env<TAppState>>;
	/**
	 * The Bun server instance.
	 */
	readonly server: Bun.Server<BunWebSocketData>;
	/**
	 * The application logger instance.
	 */
	readonly logger: Logger;
	/**
	 * The application state returned from the setup function.
	 * Available in all agents via ctx.app.
	 */
	readonly state: TAppState;

	private eventListeners = new Map<
		keyof AppEventMap<TAppState>,
		Set<AppEventCallback<any, TAppState>>
	>();

	constructor(
		state: TAppState,
		router: Hono<Env<TAppState>>,
		server: Bun.Server<BunWebSocketData>
	) {
		this.state = state;
		this.router = router;
		this.server = server;
		this.logger = getLogger() as Logger;
		setGlobalApp(this);
	}

	/**
	 * Register an event listener for application lifecycle events.
	 *
	 * Available events:
	 * - `agent.started` - Fired when an agent begins execution
	 * - `agent.completed` - Fired when an agent completes successfully
	 * - `agent.errored` - Fired when an agent throws an error
	 * - `session.started` - Fired when a new session starts
	 * - `session.completed` - Fired when a session completes
	 * - `thread.created` - Fired when a thread is created
	 * - `thread.destroyed` - Fired when a thread is destroyed
	 *
	 * @param eventName - The event name to listen for
	 * @param callback - The callback function to execute when the event fires
	 *
	 * @example
	 * ```typescript
	 * app.addEventListener('agent.started', (eventName, agent, ctx) => {
	 *   console.log(`${agent.metadata.name} started for session ${ctx.sessionId}`);
	 * });
	 *
	 * app.addEventListener('agent.errored', (eventName, agent, ctx, error) => {
	 *   console.error(`${agent.metadata.name} failed:`, error.message);
	 * });
	 *
	 * app.addEventListener('session.started', (eventName, session) => {
	 *   console.log(`New session: ${session.id}`);
	 * });
	 * ```
	 */
	addEventListener<K extends keyof AppEventMap<TAppState>>(
		eventName: K,
		callback: AppEventCallback<K, TAppState>
	): void {
		let callbacks = this.eventListeners.get(eventName);
		if (!callbacks) {
			callbacks = new Set();
			this.eventListeners.set(eventName, callbacks);
		}
		callbacks.add(callback);
	}

	/**
	 * Remove a previously registered event listener.
	 *
	 * @param eventName - The event name to stop listening for
	 * @param callback - The callback function to remove
	 *
	 * @example
	 * ```typescript
	 * const handler = (eventName, agent, ctx) => {
	 *   console.log('Agent started:', agent.metadata.name);
	 * };
	 *
	 * app.addEventListener('agent.started', handler);
	 * // Later...
	 * app.removeEventListener('agent.started', handler);
	 * ```
	 */
	removeEventListener<K extends keyof AppEventMap<TAppState>>(
		eventName: K,
		callback: AppEventCallback<K, TAppState>
	): void {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks) return;
		callbacks.delete(callback);
	}

	/**
	 * Manually fire an application event.
	 * Typically used internally by the runtime, but can be used for custom events.
	 *
	 * @param eventName - The event name to fire
	 * @param args - The arguments to pass to event listeners
	 *
	 * @example
	 * ```typescript
	 * // Fire a session completed event
	 * await app.fireEvent('session.completed', session);
	 * ```
	 */
	async fireEvent<K extends keyof AppEventMap<TAppState>>(
		eventName: K,
		...args: AppEventMap<TAppState>[K]
	): Promise<void> {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks || callbacks.size === 0) return;

		for (const callback of callbacks) {
			try {
				await callback(eventName, ...args);
			} catch (error) {
				// Log but don't re-throw - event listener errors should not crash the server
				internal.error(`Error in app event listener for '${eventName}':`, error);
			}
		}
	}
}

let globalApp: App<any> | null = null;

function setGlobalApp(app: App<any>): void {
	globalApp = app;
}

/**
 * Get the global app instance.
 * Returns null if createApp() has not been called yet.
 *
 * @returns The global App instance or null
 *
 * @example
 * ```typescript
 * const app = getApp();
 * if (app) {
 *   console.log('Server running on port:', app.server.port);
 * }
 * ```
 */
export function getApp(): App<any> | null {
	return globalApp;
}

/**
 * Creates a new Agentuity application with optional lifecycle hooks and service configuration.
 *
 * This is the main entry point for creating an Agentuity app. The app will:
 * 1. Run the setup function (if provided) to initialize app state
 * 2. Start the Bun server
 * 3. Make the app state available in all agents via ctx.app
 *
 * @template TAppState - The type of application state returned from setup function
 *
 * @param config - Optional application configuration
 * @param config.setup - Function to initialize app state, runs before server starts
 * @param config.shutdown - Function to clean up resources when server stops
 * @param config.cors - CORS configuration for HTTP routes
 * @param config.services - Override default storage and service providers
 *
 * @returns Promise resolving to App instance with running server
 *
 * @example
 * ```typescript
 * // Simple app with no state
 * const app = await createApp();
 *
 * // App with database connection
 * const app = await createApp({
 *   setup: async () => {
 *     const db = await connectDatabase();
 *     return { db };
 *   },
 *   shutdown: async (state) => {
 *     await state.db.close();
 *   }
 * });
 *
 * // Access state in agents
 * const agent = createAgent('user-query', {
 *   handler: async (ctx, input) => {
 *     const db = ctx.app.db; // Strongly typed!
 *     return db.query('SELECT * FROM users');
 *   }
 * });
 *
 * // App with custom services
 * const app = await createApp({
 *   services: {
 *     useLocal: true, // Use local in-memory storage for development
 *   }
 * });
 * ```
 */
export async function createApp<TAppState = Record<string, never>>(
	config?: AppConfig<TAppState>
): Promise<App<TAppState>> {
	const initializer = async (): Promise<TAppState> => {
		// Run setup if provided
		if (config?.setup) {
			return config.setup();
		} else {
			return {} as TAppState;
		}
	};

	const router = new Hono<Env<TAppState>>();
	const [server, state] = await createServer<TAppState>(router, initializer, config);

	return new App(state, router, server);
}

/**
 * Fire a global application event.
 * Convenience function that calls fireEvent on the global app instance.
 *
 * @param eventName - The event name to fire
 * @param args - The arguments to pass to event listeners
 *
 * @example
 * ```typescript
 * // Fire from anywhere in your app
 * await fireEvent('session.started', session);
 * await fireEvent('agent.completed', agent, ctx);
 * ```
 */
export async function fireEvent<K extends keyof AppEventMap<any>>(
	eventName: K,
	...args: AppEventMap<any>[K]
) {
	await globalApp?.fireEvent(eventName, ...args);
}
