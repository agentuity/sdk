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

export interface AppConfig {
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
}

export interface Variables {
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
}

export type TriggerType = SessionStartEvent['trigger'];

export interface PrivateVariables {
	waitUntilHandler: WaitUntilHandler;
	routeId?: string;
	agentIds: Set<string>;
	trigger: TriggerType;
}

export interface Env extends HonoEnv {
	Variables: Variables;
}

type AppEventMap = {
	'agent.started': [Agent<any, any, any>, AgentContext];
	'agent.completed': [Agent<any, any, any>, AgentContext];
	'agent.errored': [Agent<any, any, any>, AgentContext, Error];
	'session.started': [Session];
	'session.completed': [Session];
	'thread.created': [Thread];
	'thread.destroyed': [Thread];
};

type AppEventCallback<K extends keyof AppEventMap> = (
	eventName: K,
	...args: AppEventMap[K]
) => void | Promise<void>;

export class App {
	/**
	 * the router instance
	 */
	readonly router: Hono<Env>;
	/**
	 * the server instance
	 */
	readonly server: ReturnType<typeof createServer>;
	/**
	 * the logger instance
	 */
	readonly logger: Logger;

	private eventListeners = new Map<keyof AppEventMap, Set<AppEventCallback<any>>>();

	constructor(config?: AppConfig) {
		this.router = new Hono<Env>();
		this.server = createServer(this.router, config);
		this.logger = getLogger() as Logger;
		setGlobalApp(this);
	}

	addEventListener<K extends keyof AppEventMap>(
		eventName: K,
		callback: AppEventCallback<K>
	): void {
		let callbacks = this.eventListeners.get(eventName);
		if (!callbacks) {
			callbacks = new Set();
			this.eventListeners.set(eventName, callbacks);
		}
		callbacks.add(callback);
	}

	removeEventListener<K extends keyof AppEventMap>(
		eventName: K,
		callback: AppEventCallback<K>
	): void {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks) return;
		callbacks.delete(callback);
	}

	async fireEvent<K extends keyof AppEventMap>(
		eventName: K,
		...args: AppEventMap[K]
	): Promise<void> {
		const callbacks = this.eventListeners.get(eventName);
		if (!callbacks || callbacks.size === 0) return;

		for (const callback of callbacks) {
			await callback(eventName, ...args);
		}
	}
}

let globalApp: App | null = null;

function setGlobalApp(app: App): void {
	globalApp = app;
}

export function getApp(): App | null {
	return globalApp;
}

/**
 * create a new app instance
 *
 * @returns App instance
 */
export function createApp(config?: AppConfig): App {
	return new App(config);
}

/**
 * fire a global event
 *
 * @param eventName
 * @param args
 */
export async function fireEvent<K extends keyof AppEventMap>(
	eventName: K,
	...args: AppEventMap[K]
) {
	await globalApp?.fireEvent(eventName, ...args);
}
