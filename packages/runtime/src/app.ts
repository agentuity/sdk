import { type Env as HonoEnv, Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServer, getLogger } from './_server';
import type { Logger } from './logger';
import { type Meter, type Tracer } from '@opentelemetry/api';
import {
	type KeyValueStorage,
	type ObjectStorage,
	type StreamStorage,
	type VectorStorage,
} from '@agentuity/core';
import type { Email } from './io/email';
import type { Agent, AgentContext } from './agent';

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
	};
}

export interface Variables {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
	email?: Email;
}

export interface Env extends HonoEnv {
	Variables: Variables;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

type AppEventMap = {
	'agent.started': [Agent<any, any, any>, AgentContext];
	'agent.completed': [Agent<any, any, any>, AgentContext];
	'agent.errored': [Agent<any, any, any>, AgentContext, Error];
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
