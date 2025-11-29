/* eslint-disable @typescript-eslint/no-explicit-any */
/** biome-ignore-all lint/suspicious/noExplicitAny: anys are great */
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { type Env, fireEvent } from './app';
import type { AppState } from './index';

export type ThreadEventName = 'destroyed';
export type SessionEventName = 'completed';

type ThreadEventCallback<T extends Thread> = (
	eventName: 'destroyed',
	thread: T
) => Promise<void> | void;

type SessionEventCallback<T extends Session> = (
	eventName: 'completed',
	session: T
) => Promise<void> | void;

export interface Thread {
	id: string;
	state: Map<string, unknown>;
	addEventListener(
		eventName: 'destroyed',
		callback: (eventName: 'destroyed', thread: Thread) => Promise<void> | void
	): void;
	removeEventListener(
		eventName: 'destroyed',
		callback: (eventName: 'destroyed', thread: Thread) => Promise<void> | void
	): void;
	destroy(): Promise<void>;
}

export interface Session {
	id: string;
	thread: Thread;
	state: Map<string, unknown>;
	addEventListener(
		eventName: 'completed',
		callback: (eventName: 'completed', session: Session) => Promise<void> | void
	): void;
	removeEventListener(
		eventName: 'completed',
		callback: (eventName: 'completed', session: Session) => Promise<void> | void
	): void;
}

export interface ThreadProvider {
	initialize(appState: AppState): Promise<void>;
	restore(ctx: Context<Env>): Promise<Thread>;
	save(thread: Thread): Promise<void>;
	destroy(thread: Thread): Promise<void>;
}

export interface SessionProvider {
	initialize(appState: AppState): Promise<void>;
	restore(thread: Thread, sessionId: string): Promise<Session>;
	save(session: Session): Promise<void>;
}

// WeakMap to store event listeners for Thread and Session instances
const threadEventListeners = new WeakMap<
	Thread,
	Map<ThreadEventName, Set<ThreadEventCallback<any>>>
>();
const sessionEventListeners = new WeakMap<
	Session,
	Map<SessionEventName, Set<SessionEventCallback<any>>>
>();

// Helper to fire thread event listeners
async function fireThreadEvent(thread: Thread, eventName: ThreadEventName): Promise<void> {
	const listeners = threadEventListeners.get(thread);
	if (!listeners) return;

	const callbacks = listeners.get(eventName);
	if (!callbacks || callbacks.size === 0) return;

	for (const callback of callbacks) {
		await (callback as any)(eventName, thread);
	}
}

// Helper to fire session event listeners
async function fireSessionEvent(session: Session, eventName: SessionEventName): Promise<void> {
	const listeners = sessionEventListeners.get(session);
	if (!listeners) return;

	const callbacks = listeners.get(eventName);
	if (!callbacks || callbacks.size === 0) return;

	for (const callback of callbacks) {
		await (callback as any)(eventName, session);
	}
}

// Generate thread or session ID
export function generateId(prefix?: string): string {
	const arr = new Uint8Array(16);
	crypto.getRandomValues(arr);
	return `${prefix}${prefix ? '_' : ''}${arr.toHex()}`;
}

export class DefaultThread implements Thread {
	#lastUsed: number;
	readonly id: string;
	readonly state: Map<string, unknown>;
	private provider: ThreadProvider;

	constructor(provider: ThreadProvider, id: string) {
		this.provider = provider;
		this.id = id;
		this.state = new Map();
		this.#lastUsed = Date.now();
	}

	addEventListener(eventName: ThreadEventName, callback: ThreadEventCallback<any>): void {
		let listeners = threadEventListeners.get(this);
		if (!listeners) {
			listeners = new Map();
			threadEventListeners.set(this, listeners);
		}
		let callbacks = listeners.get(eventName);
		if (!callbacks) {
			callbacks = new Set();
			listeners.set(eventName, callbacks);
		}
		callbacks.add(callback);
	}

	removeEventListener(eventName: ThreadEventName, callback: ThreadEventCallback<any>): void {
		const listeners = threadEventListeners.get(this);
		if (!listeners) return;
		const callbacks = listeners.get(eventName);
		if (!callbacks) return;
		callbacks.delete(callback);
	}

	async fireEvent(eventName: ThreadEventName): Promise<void> {
		await fireThreadEvent(this, eventName);
	}

	async destroy(): Promise<void> {
		this.provider.destroy(this);
	}

	touch() {
		this.#lastUsed = Date.now();
	}

	expired() {
		return Date.now() - this.#lastUsed >= 3.6e6; // 1 hour
	}
}

export class DefaultSession implements Session {
	readonly id: string;
	readonly thread: Thread;
	readonly state: Map<string, unknown>;

	constructor(thread: Thread, id: string) {
		this.id = id;
		this.thread = thread;
		this.state = new Map();
	}

	addEventListener(eventName: SessionEventName, callback: SessionEventCallback<any>): void {
		let listeners = sessionEventListeners.get(this);
		if (!listeners) {
			listeners = new Map();
			sessionEventListeners.set(this, listeners);
		}
		let callbacks = listeners.get(eventName);
		if (!callbacks) {
			callbacks = new Set();
			listeners.set(eventName, callbacks);
		}
		callbacks.add(callback);
	}

	removeEventListener(eventName: SessionEventName, callback: SessionEventCallback<any>): void {
		const listeners = sessionEventListeners.get(this);
		if (!listeners) return;
		const callbacks = listeners.get(eventName);
		if (!callbacks) return;
		callbacks.delete(callback);
	}

	async fireEvent(eventName: SessionEventName): Promise<void> {
		await fireSessionEvent(this, eventName);
	}
}

export class DefaultThreadProvider implements ThreadProvider {
	private threads = new Map<string, DefaultThread>();

	async initialize(_appState: AppState): Promise<void> {
		setInterval(() => {
			for (const [, thread] of this.threads) {
				if (thread.expired()) {
					void (async () => {
						try {
							await this.destroy(thread);
						} catch (err) {
							console.error('Failed to destroy expired thread', err);
						}
					})();
				}
			}
		}, 60_000).unref();
	}

	async restore(ctx: Context<Env>): Promise<Thread> {
		const cookie = getCookie(ctx);
		let threadId: string | undefined;

		if (cookie.atid?.startsWith('thrd_')) {
			threadId = cookie.atid;
		}

		threadId = threadId || generateId('thrd');

		if (threadId) {
			setCookie(ctx, 'atid', threadId);
			const existing = this.threads.get(threadId);
			if (existing) {
				return existing;
			}
		}

		const thread = new DefaultThread(this, threadId);
		this.threads.set(thread.id, thread);
		await fireEvent('thread.created', thread);
		return thread;
	}

	async save(thread: Thread): Promise<void> {
		if (thread instanceof DefaultThread) {
			thread.touch();
		}
	}

	async destroy(thread: Thread): Promise<void> {
		if (thread instanceof DefaultThread) {
			try {
				await thread.fireEvent('destroyed');
				await fireEvent('thread.destroyed', thread);
			} finally {
				this.threads.delete(thread.id);
				threadEventListeners.delete(thread);
			}
		}
	}
}

export class DefaultSessionProvider implements SessionProvider {
	private sessions = new Map<string, DefaultSession>();

	async initialize(_appState: AppState): Promise<void> {
		// No initialization needed for in-memory provider
	}

	async restore(thread: Thread, sessionId: string): Promise<Session> {
		let session = this.sessions.get(sessionId);
		if (!session) {
			session = new DefaultSession(thread, sessionId);
			this.sessions.set(sessionId, session);
			await fireEvent('session.started', session);
		}
		return session;
	}

	async save(session: Session): Promise<void> {
		if (session instanceof DefaultSession) {
			try {
				await session.fireEvent('completed');
				await fireEvent('session.completed', session);
			} finally {
				this.sessions.delete(session.id);
				sessionEventListeners.delete(session);
			}
		}
	}
}
