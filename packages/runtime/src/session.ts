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

/**
 * Represents a conversation thread that persists across multiple sessions.
 * Threads maintain state and can contain multiple request-response sessions.
 *
 * Threads are automatically managed by the runtime and stored in cookies.
 * They expire after 1 hour of inactivity by default.
 *
 * @example
 * ```typescript
 * // Access thread in agent handler
 * const agent = createAgent({
 *   handler: async (ctx, input) => {
 *     // Get thread ID
 *     console.log('Thread:', ctx.thread.id);
 *
 *     // Store data in thread state (persists across sessions)
 *     ctx.thread.state.set('conversationCount',
 *       (ctx.thread.state.get('conversationCount') as number || 0) + 1
 *     );
 *
 *     // Listen for thread destruction
 *     ctx.thread.addEventListener('destroyed', (eventName, thread) => {
 *       console.log('Thread destroyed:', thread.id);
 *     });
 *
 *     return 'Response';
 *   }
 * });
 * ```
 */
export interface Thread {
	/**
	 * Unique thread identifier (e.g., "thrd_a1b2c3d4...").
	 * Stored in cookie and persists across requests.
	 */
	id: string;

	/**
	 * Thread-scoped state storage that persists across multiple sessions.
	 * Use this to maintain conversation history or user preferences.
	 *
	 * @example
	 * ```typescript
	 * // Store conversation count
	 * ctx.thread.state.set('messageCount',
	 *   (ctx.thread.state.get('messageCount') as number || 0) + 1
	 * );
	 * ```
	 */
	state: Map<string, unknown>;

	/**
	 * Register an event listener for when the thread is destroyed.
	 * Thread is destroyed when it expires or is manually destroyed.
	 *
	 * @param eventName - Must be 'destroyed'
	 * @param callback - Function called when thread is destroyed
	 *
	 * @example
	 * ```typescript
	 * ctx.thread.addEventListener('destroyed', (eventName, thread) => {
	 *   console.log('Cleaning up thread:', thread.id);
	 * });
	 * ```
	 */
	addEventListener(
		eventName: 'destroyed',
		callback: (eventName: 'destroyed', thread: Thread) => Promise<void> | void
	): void;

	/**
	 * Remove a previously registered 'destroyed' event listener.
	 *
	 * @param eventName - Must be 'destroyed'
	 * @param callback - The callback function to remove
	 */
	removeEventListener(
		eventName: 'destroyed',
		callback: (eventName: 'destroyed', thread: Thread) => Promise<void> | void
	): void;

	/**
	 * Manually destroy the thread and clean up resources.
	 * Fires the 'destroyed' event and removes thread from storage.
	 *
	 * @example
	 * ```typescript
	 * // End conversation
	 * await ctx.thread.destroy();
	 * ```
	 */
	destroy(): Promise<void>;
}

/**
 * Represents a single request-response session within a thread.
 * Sessions are scoped to a single agent execution and its sub-agent calls.
 *
 * Each HTTP request creates a new session with a unique ID, but shares the same thread.
 *
 * @example
 * ```typescript
 * const agent = createAgent({
 *   handler: async (ctx, input) => {
 *     // Get session ID (unique per request)
 *     console.log('Session:', ctx.session.id);
 *
 *     // Store data in session state (only for this request)
 *     ctx.session.state.set('startTime', Date.now());
 *
 *     // Access parent thread
 *     console.log('Thread:', ctx.session.thread.id);
 *
 *     // Listen for session completion
 *     ctx.session.addEventListener('completed', (eventName, session) => {
 *       const duration = Date.now() - (session.state.get('startTime') as number);
 *       console.log(`Session completed in ${duration}ms`);
 *     });
 *
 *     return 'Response';
 *   }
 * });
 * ```
 */
export interface Session {
	/**
	 * Unique session identifier for this request.
	 * Changes with each HTTP request, even within the same thread.
	 */
	id: string;

	/**
	 * The parent thread this session belongs to.
	 * Multiple sessions can share the same thread.
	 */
	thread: Thread;

	/**
	 * Session-scoped state storage that only exists for this request.
	 * Use this for temporary data that shouldn't persist across requests.
	 *
	 * @example
	 * ```typescript
	 * ctx.session.state.set('requestStartTime', Date.now());
	 * ```
	 */
	state: Map<string, unknown>;

	/**
	 * Register an event listener for when the session completes.
	 * Fired after the agent handler returns and response is sent.
	 *
	 * @param eventName - Must be 'completed'
	 * @param callback - Function called when session completes
	 *
	 * @example
	 * ```typescript
	 * ctx.session.addEventListener('completed', (eventName, session) => {
	 *   console.log('Session finished:', session.id);
	 * });
	 * ```
	 */
	addEventListener(
		eventName: 'completed',
		callback: (eventName: 'completed', session: Session) => Promise<void> | void
	): void;

	/**
	 * Remove a previously registered 'completed' event listener.
	 *
	 * @param eventName - Must be 'completed'
	 * @param callback - The callback function to remove
	 */
	removeEventListener(
		eventName: 'completed',
		callback: (eventName: 'completed', session: Session) => Promise<void> | void
	): void;
}

/**
 * Provider interface for managing thread lifecycle and persistence.
 * Implement this to customize how threads are stored and retrieved.
 *
 * The default implementation (DefaultThreadProvider) stores threads in-memory
 * with cookie-based identification and 1-hour expiration.
 *
 * @example
 * ```typescript
 * class RedisThreadProvider implements ThreadProvider {
 *   private redis: Redis;
 *
 *   async initialize(appState: AppState): Promise<void> {
 *     this.redis = await connectRedis();
 *   }
 *
 *   async restore(ctx: Context<Env>): Promise<Thread> {
 *     const threadId = getCookie(ctx, 'atid') || generateId('thrd');
 *     const data = await this.redis.get(`thread:${threadId}`);
 *     const thread = new DefaultThread(this, threadId);
 *     if (data) {
 *       thread.state = new Map(JSON.parse(data));
 *     }
 *     return thread;
 *   }
 *
 *   async save(thread: Thread): Promise<void> {
 *     await this.redis.setex(
 *       `thread:${thread.id}`,
 *       3600,
 *       JSON.stringify([...thread.state])
 *     );
 *   }
 *
 *   async destroy(thread: Thread): Promise<void> {
 *     await this.redis.del(`thread:${thread.id}`);
 *   }
 * }
 *
 * // Use custom provider
 * const app = await createApp({
 *   services: {
 *     thread: new RedisThreadProvider()
 *   }
 * });
 * ```
 */
export interface ThreadProvider {
	/**
	 * Initialize the provider when the app starts.
	 * Use this to set up connections, start cleanup intervals, etc.
	 *
	 * @param appState - The app state from createApp setup function
	 */
	initialize(appState: AppState): Promise<void>;

	/**
	 * Restore or create a thread from the HTTP request context.
	 * Should check cookies for existing thread ID or create a new one.
	 *
	 * @param ctx - Hono request context
	 * @returns The restored or newly created thread
	 */
	restore(ctx: Context<Env>): Promise<Thread>;

	/**
	 * Persist thread state to storage.
	 * Called periodically to save thread data.
	 *
	 * @param thread - The thread to save
	 */
	save(thread: Thread): Promise<void>;

	/**
	 * Destroy a thread and clean up resources.
	 * Should fire the 'destroyed' event and remove from storage.
	 *
	 * @param thread - The thread to destroy
	 */
	destroy(thread: Thread): Promise<void>;
}

/**
 * Provider interface for managing session lifecycle and persistence.
 * Implement this to customize how sessions are stored and retrieved.
 *
 * The default implementation (DefaultSessionProvider) stores sessions in-memory
 * and automatically cleans them up after completion.
 *
 * @example
 * ```typescript
 * class PostgresSessionProvider implements SessionProvider {
 *   private db: Database;
 *
 *   async initialize(appState: AppState): Promise<void> {
 *     this.db = appState.db;
 *   }
 *
 *   async restore(thread: Thread, sessionId: string): Promise<Session> {
 *     const row = await this.db.query(
 *       'SELECT state FROM sessions WHERE id = $1',
 *       [sessionId]
 *     );
 *     const session = new DefaultSession(thread, sessionId);
 *     if (row) {
 *       session.state = new Map(JSON.parse(row.state));
 *     }
 *     return session;
 *   }
 *
 *   async save(session: Session): Promise<void> {
 *     await this.db.query(
 *       'INSERT INTO sessions (id, thread_id, state) VALUES ($1, $2, $3)',
 *       [session.id, session.thread.id, JSON.stringify([...session.state])]
 *     );
 *   }
 * }
 *
 * // Use custom provider
 * const app = await createApp({
 *   services: {
 *     session: new PostgresSessionProvider()
 *   }
 * });
 * ```
 */
export interface SessionProvider {
	/**
	 * Initialize the provider when the app starts.
	 * Use this to set up database connections or other resources.
	 *
	 * @param appState - The app state from createApp setup function
	 */
	initialize(appState: AppState): Promise<void>;

	/**
	 * Restore or create a session for the given thread and session ID.
	 * Should load existing session data or create a new session.
	 *
	 * @param thread - The parent thread for this session
	 * @param sessionId - The unique session identifier
	 * @returns The restored or newly created session
	 */
	restore(thread: Thread, sessionId: string): Promise<Session>;

	/**
	 * Persist session state and fire completion events.
	 * Called after the agent handler completes.
	 *
	 * @param session - The session to save
	 */
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
