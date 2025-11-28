/* eslint-disable @typescript-eslint/no-explicit-any */
/** biome-ignore-all lint/suspicious/noExplicitAny: any are ok */
import { type Env as HonoEnv, Hono } from 'hono';
import type { cors } from 'hono/cors';
import type { Logger } from './logger';
import { createServer, getLogger } from './_server';
import type { Meter, Tracer } from '@opentelemetry/api';
import type {
	KeyValueStorage,
	ObjectStorage,
	SessionEventProvider,
	EvalRunEventProvider,
	StreamStorage,
	VectorStorage,
	SessionStartEvent,
} from '@agentuity/core';
import type { Email } from './io/email';
import type { Agent, AgentContext, AgentRegistry } from './agent';
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
		 * the ObjectStorage to override instead of the default
		 */
		object?: ObjectStorage;
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
	agent: AgentRegistry;
	kv: KeyValueStorage;
	objectstore: ObjectStorage;
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
	'agent.started': [
		Agent<any, any, any, any, TAppState>,
		AgentContext<any, any, any, any, TAppState>,
	];
	'agent.completed': [
		Agent<any, any, any, any, TAppState>,
		AgentContext<any, any, any, any, TAppState>,
	];
	'agent.errored': [
		Agent<any, any, any, any, TAppState>,
		AgentContext<any, any, any, any, TAppState>,
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

export class App<TAppState = Record<string, never>> {
	/**
	 * the router instance
	 */
	readonly router: Hono<Env<TAppState>>;
	/**
	 * the server instance
	 */
	readonly server: ReturnType<typeof createServer>;
	/**
	 * the logger instance
	 */
	readonly logger: Logger;
	/**
	 * the app state returned from setup
	 */
	readonly state: TAppState;

	private eventListeners = new Map<
		keyof AppEventMap<TAppState>,
		Set<AppEventCallback<any, TAppState>>
	>();

	constructor(state: TAppState, config?: AppConfig<TAppState>) {
		this.state = state;
		this.router = new Hono<Env<TAppState>>();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.server = createServer(this.router as any, config as any, state as any);
		this.logger = getLogger() as Logger;
		setGlobalApp(this);
	}

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

	removeEventListener<K extends keyof AppEventMap<TAppState>>(
		eventName: K,
		callback: AppEventCallback<K, TAppState>
	): void {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks) return;
		callbacks.delete(callback);
	}

	async fireEvent<K extends keyof AppEventMap<TAppState>>(
		eventName: K,
		...args: AppEventMap<TAppState>[K]
	): Promise<void> {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks || callbacks.size === 0) return;

		for (const callback of callbacks) {
			await callback(eventName, ...args);
		}
	}
}

let globalApp: App<any> | null = null;

function setGlobalApp(app: App<any>): void {
	globalApp = app;
}

export function getApp(): App<any> | null {
	return globalApp;
}

/**
 * create a new app instance with optional lifecycle methods
 *
 * @returns App instance (will start server after setup completes)
 */
export async function createApp<TAppState = Record<string, never>>(
	config?: AppConfig<TAppState>
): Promise<App<TAppState>> {
	// Run setup if provided
	let state: TAppState;
	if (config?.setup) {
		state = await config.setup();
	} else {
		state = {} as TAppState;
	}

	return new App(state, config);
}

/**
 * fire a global event
 *
 * @param eventName
 * @param args
 */
export async function fireEvent<K extends keyof AppEventMap<any>>(
	eventName: K,
	...args: AppEventMap<any>[K]
) {
	await globalApp?.fireEvent(eventName, ...args);
}
