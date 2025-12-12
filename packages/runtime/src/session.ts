/* eslint-disable @typescript-eslint/no-explicit-any */
/** biome-ignore-all lint/suspicious/noExplicitAny: anys are great */
import type { Context } from 'hono';
import { type Env, fireEvent } from './app';
import type { AppState } from './index';
import { getServiceUrls } from '@agentuity/server';
import { WebSocket } from 'ws';
import { internal } from './logger/internal';

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
 * const agent = createAgent('conversation', {
 *   handler: async (ctx, input) => {
 *     // Get thread ID
 *     ctx.logger.info('Thread: %s', ctx.thread.id);
 *
 *     // Store data in thread state (persists across sessions)
 *     ctx.thread.state.set('conversationCount',
 *       (ctx.thread.state.get('conversationCount') as number || 0) + 1
 *     );
 *
 *     // Listen for thread destruction
 *     ctx.thread.addEventListener('destroyed', (eventName, thread) => {
 *       ctx.logger.info('Thread destroyed: %s', thread.id);
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
	 *   ctx.logger.info('Cleaning up thread: %s', thread.id);
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
	 * // Permanently delete the thread from storage
	 * await ctx.thread.destroy();
	 * ```
	 */
	destroy(): Promise<void>;

	/**
	 * Check if the thread has any data.
	 * Returns true if thread state is empty (no data to save).
	 *
	 * @example
	 * ```typescript
	 * if (ctx.thread.empty()) {
	 *   // Thread has no data, won't be persisted
	 * }
	 * ```
	 */
	empty(): boolean;
}

/**
 * Represents a single request-response session within a thread.
 * Sessions are scoped to a single agent execution and its sub-agent calls.
 *
 * Each HTTP request creates a new session with a unique ID, but shares the same thread.
 *
 * @example
 * ```typescript
 * const agent = createAgent('request-handler', {
 *   handler: async (ctx, input) => {
 *     // Get session ID (unique per request)
 *     ctx.logger.info('Session: %s', ctx.session.id);
 *
 *     // Store data in session state (only for this request)
 *     ctx.session.state.set('startTime', Date.now());
 *
 *     // Access parent thread
 *     ctx.logger.info('Thread: %s', ctx.session.thread.id);
 *
 *     // Listen for session completion
 *     ctx.session.addEventListener('completed', (eventName, session) => {
 *       const duration = Date.now() - (session.state.get('startTime') as number);
 *       ctx.logger.info('Session completed in %dms', duration);
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
	 *   ctx.logger.info('Session finished: %s', session.id);
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

	/**
	 * Return the session data as a serializable string or return undefined if not
	 * data should be serialized.
	 */
	serializeUserData(): string | undefined;
}

/**
 * Represent an interface for handling how thread ids are generated or restored.
 */
export interface ThreadIDProvider {
	/**
	 * A function that should return a thread id to be used for the incoming request.
	 * The returning thread id must be globally unique and must start with the prefix
	 * thrd_ such as `thrd_212c16896b974ffeb21a748f0eeba620`. The max length of the
	 * string is 64 characters and the min length is 32 characters long
	 * (including the prefix). The characters after the prefix must match the
	 * regular expression [a-zA-Z0-9-].
	 *
	 * @param appState - The app state from createApp setup function
	 * @param ctx - Hono request context
	 * @returns The thread id to use
	 */
	getThreadId(appState: AppState, ctx: Context<Env>): string;
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
	 * Set the provider to use for generating / restoring the thread id
	 * on new requests.  Overrides the built-in provider when set.
	 *
	 * @param provider - the provider implementation
	 */
	setThreadIDProvider(provider: ThreadIDProvider): void;

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
		try {
			await (callback as any)(eventName, thread);
		} catch (error) {
			// Log but don't re-throw - event listener errors should not crash the server
			internal.error(`Error in thread event listener for '${eventName}':`, error);
		}
	}
}

// Helper to fire session event listeners
async function fireSessionEvent(session: Session, eventName: SessionEventName): Promise<void> {
	const listeners = sessionEventListeners.get(session);
	if (!listeners) return;

	const callbacks = listeners.get(eventName);
	if (!callbacks || callbacks.size === 0) return;

	for (const callback of callbacks) {
		try {
			await (callback as any)(eventName, session);
		} catch (error) {
			// Log but don't re-throw - event listener errors should not crash the server
			internal.error(`Error in session event listener for '${eventName}':`, error);
		}
	}
}

// Generate thread or session ID
export function generateId(prefix?: string): string {
	const arr = new Uint8Array(16);
	crypto.getRandomValues(arr);
	return `${prefix}${prefix ? '_' : ''}${arr.toHex()}`;
}

const validThreadIdCharacters = /^[a-zA-Z0-9-]+$/;
const WORKBENCH_THREAD_HEADER = 'x-agentuity-workbench-thread-id';

function isValidThreadId(threadId: string | undefined): threadId is string {
	if (!threadId) return false;
	if (!threadId.startsWith('thrd_')) return false;
	if (threadId.length > 64) return false;
	if (threadId.length < 32) return false;
	if (!validThreadIdCharacters.test(threadId.substring(5))) return false;
	return true;
}

/**
 * DefaultThreadIDProvider will look for `x-agentuity-workbench-thread-id`
 * and use it as the thread id or if not found, generate a new one.
 */
export class DefaultThreadIDProvider implements ThreadIDProvider {
	getThreadId(_appState: AppState, ctx: Context<Env>): string {
		const headerValue = ctx.req.header(WORKBENCH_THREAD_HEADER);
		const threadId = isValidThreadId(headerValue) ? headerValue : generateId('thrd');

		// Always echo the chosen thread id back to the client so it can persist it (e.g. localStorage).
		ctx.header(WORKBENCH_THREAD_HEADER, threadId);
		return threadId;
	}
}

export class DefaultThread implements Thread {
	#initialStateJson: string | undefined;
	readonly id: string;
	readonly state: Map<string, unknown>;
	private provider: ThreadProvider;

	constructor(provider: ThreadProvider, id: string, initialStateJson?: string) {
		this.provider = provider;
		this.id = id;
		this.state = new Map();
		this.#initialStateJson = initialStateJson;
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
		await this.provider.destroy(this);
	}

	/**
	 * Check if thread state has been modified since restore
	 * @internal
	 */
	isDirty(): boolean {
		if (this.state.size === 0 && !this.#initialStateJson) {
			return false;
		}

		const currentJson = JSON.stringify(Object.fromEntries(this.state));

		return currentJson !== this.#initialStateJson;
	}

	/**
	 * Check if thread has any data
	 */
	empty(): boolean {
		return this.state.size === 0;
	}

	/**
	 * Get serialized state for saving
	 * @internal
	 */
	getSerializedState(): string {
		return JSON.stringify(Object.fromEntries(this.state));
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

	/**
	 * Serialize session state to JSON string for persistence.
	 * Returns undefined if state is empty or exceeds 1MB limit.
	 * @internal
	 */
	serializeUserData(): string | undefined {
		if (this.state.size === 0) {
			return undefined;
		}

		try {
			const obj = Object.fromEntries(this.state);
			const json = JSON.stringify(obj);

			// Check 1MB limit (1,048,576 bytes)
			const sizeInBytes = new TextEncoder().encode(json).length;
			if (sizeInBytes > 1048576) {
				console.error(
					`Session ${this.id} user_data exceeds 1MB limit (${sizeInBytes} bytes), data will not be persisted`
				);
				return undefined;
			}

			return json;
		} catch (err) {
			console.error(`Failed to serialize session ${this.id} user_data:`, err);
			return undefined;
		}
	}
}

/**
 * WebSocket client for thread state persistence.
 *
 * **WARNING: This class is exported for testing purposes only and is subject to change
 * without notice. Do not use this class directly in production code.**
 *
 * @internal
 * @experimental
 */
export class ThreadWebSocketClient {
	private ws: WebSocket | null = null;
	private authenticated = false;
	private pendingRequests = new Map<
		string,
		{ resolve: (data?: string) => void; reject: (err: Error) => void }
	>();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private apiKey: string;
	private wsUrl: string;
	private wsConnecting: Promise<void> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private isDisposed = false;
	private initialConnectResolve: (() => void) | null = null;
	private initialConnectReject: ((err: Error) => void) | null = null;

	constructor(apiKey: string, wsUrl: string) {
		this.apiKey = apiKey;
		this.wsUrl = wsUrl;
	}

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			// Store the initial connect promise callbacks if this is the first attempt
			if (this.reconnectAttempts === 0) {
				this.initialConnectResolve = resolve;
				this.initialConnectReject = reject;
			}

			// Set connection timeout
			const connectionTimeout = setTimeout(() => {
				this.cleanup();
				const rejectFn = this.initialConnectReject || reject;
				this.initialConnectResolve = null;
				this.initialConnectReject = null;
				rejectFn(new Error('WebSocket connection timeout (10s)'));
			}, 10_000);

			try {
				this.ws = new WebSocket(this.wsUrl);

				this.ws.on('open', () => {
					// Send authentication (do NOT clear timeout yet - wait for auth response)
					this.ws?.send(JSON.stringify({ authorization: this.apiKey }));
				});

				this.ws.on('message', (data: any) => {
					try {
						const message = JSON.parse(data.toString());

						// Handle auth response
						if ('success' in message && !this.authenticated) {
							clearTimeout(connectionTimeout);
							if (message.success) {
								this.authenticated = true;
								this.reconnectAttempts = 0;

								// Resolve both the current promise and the initial connect promise
								const resolveFn = this.initialConnectResolve || resolve;
								this.initialConnectResolve = null;
								this.initialConnectReject = null;
								resolveFn();
							} else {
								const err = new Error(
									`WebSocket authentication failed: ${message.error || 'Unknown error'}`
								);
								this.cleanup();
								const rejectFn = this.initialConnectReject || reject;
								this.initialConnectResolve = null;
								this.initialConnectReject = null;
								rejectFn(err);
							}
							return;
						}

						// Handle action response
						if ('id' in message && this.pendingRequests.has(message.id)) {
							const pending = this.pendingRequests.get(message.id)!;
							this.pendingRequests.delete(message.id);

							if (message.success) {
								pending.resolve(message.data);
							} else {
								pending.reject(new Error(message.error || 'Request failed'));
							}
						}
					} catch {
						// Ignore parse errors
					}
				});

				this.ws.on('error', (err: Error) => {
					clearTimeout(connectionTimeout);
					if (!this.authenticated) {
						// Don't reject immediately if we'll attempt reconnection
						if (this.reconnectAttempts >= this.maxReconnectAttempts || this.isDisposed) {
							const rejectFn = this.initialConnectReject || reject;
							this.initialConnectResolve = null;
							this.initialConnectReject = null;
							rejectFn(new Error(`WebSocket error: ${err.message}`));
						}
					}
				});

				this.ws.on('close', () => {
					clearTimeout(connectionTimeout);
					const wasAuthenticated = this.authenticated;
					this.authenticated = false;

					// Reject all pending requests
					for (const [id, pending] of this.pendingRequests) {
						pending.reject(new Error('WebSocket connection closed'));
						this.pendingRequests.delete(id);
					}

					// Don't attempt reconnection if disposed
					if (this.isDisposed) {
						// Reject initial connect if still pending
						if (!wasAuthenticated && this.initialConnectReject) {
							this.initialConnectReject(new Error('WebSocket closed before authentication'));
							this.initialConnectResolve = null;
							this.initialConnectReject = null;
						}
						return;
					}

					// Attempt reconnection if within retry limits (even if auth didn't complete)
					// This handles server rollouts where connection closes before auth finishes
					if (this.reconnectAttempts < this.maxReconnectAttempts) {
						this.reconnectAttempts++;
						const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);

						internal.info(
							`WebSocket disconnected, attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
						);

						// Schedule reconnection with backoff delay
						this.reconnectTimer = setTimeout(() => {
							this.reconnectTimer = null;
							// Create new connection promise for reconnection
							this.wsConnecting = this.connect().catch(() => {
								// Reconnection failed, reset
								this.wsConnecting = null;
							});
						}, delay);
					} else {
						internal.error(
							`WebSocket disconnected after ${this.reconnectAttempts} attempts, giving up`
						);

						// Reject initial connect if still pending (all attempts exhausted)
						if (!wasAuthenticated && this.initialConnectReject) {
							this.initialConnectReject(
								new Error(
									`WebSocket closed before authentication after ${this.reconnectAttempts} attempts`
								)
							);
							this.initialConnectResolve = null;
							this.initialConnectReject = null;
						}
					}
				});
			} catch (err) {
				clearTimeout(connectionTimeout);
				const rejectFn = this.initialConnectReject || reject;
				this.initialConnectResolve = null;
				this.initialConnectReject = null;
				rejectFn(err as Error);
			}
		});
	}

	async restore(threadId: string): Promise<string | undefined> {
		// Wait for connection/reconnection if in progress
		if (this.wsConnecting) {
			await this.wsConnecting;
		}

		if (!this.authenticated || !this.ws) {
			throw new Error('WebSocket not connected or authenticated');
		}

		return new Promise((resolve, reject) => {
			const requestId = crypto.randomUUID();
			this.pendingRequests.set(requestId, { resolve, reject });

			const message = {
				id: requestId,
				action: 'restore',
				data: { thread_id: threadId },
			};

			this.ws!.send(JSON.stringify(message));

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	async save(threadId: string, userData: string): Promise<void> {
		// Wait for connection/reconnection if in progress
		if (this.wsConnecting) {
			await this.wsConnecting;
		}

		if (!this.authenticated || !this.ws) {
			throw new Error('WebSocket not connected or authenticated');
		}

		// Check 1MB limit
		const sizeInBytes = new TextEncoder().encode(userData).length;
		if (sizeInBytes > 1048576) {
			console.error(
				`Thread ${threadId} user_data exceeds 1MB limit (${sizeInBytes} bytes), data will not be persisted`
			);
			return;
		}

		return new Promise((resolve, reject) => {
			const requestId = crypto.randomUUID();
			this.pendingRequests.set(requestId, {
				resolve: () => resolve(),
				reject,
			});

			const message = {
				id: requestId,
				action: 'save',
				data: { thread_id: threadId, user_data: userData },
			};

			this.ws!.send(JSON.stringify(message));

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error('Request timeout'));
				}
			}, 10_000);
		});
	}

	async delete(threadId: string): Promise<void> {
		// Wait for connection/reconnection if in progress
		if (this.wsConnecting) {
			await this.wsConnecting;
		}

		if (!this.authenticated || !this.ws) {
			throw new Error('WebSocket not connected or authenticated');
		}

		return new Promise((resolve, reject) => {
			const requestId = crypto.randomUUID();
			this.pendingRequests.set(requestId, {
				resolve: () => resolve(),
				reject,
			});

			const message = {
				id: requestId,
				action: 'delete',
				data: { thread_id: threadId },
			};

			this.ws!.send(JSON.stringify(message));

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error('Request timeout'));
				}
			}, 10_000);
		});
	}

	cleanup(): void {
		// Mark as disposed to prevent new reconnection attempts
		this.isDisposed = true;

		// Cancel any pending reconnection timer
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.authenticated = false;
		this.pendingRequests.clear();
		this.reconnectAttempts = 0;
		this.wsConnecting = null;
		this.initialConnectResolve = null;
		this.initialConnectReject = null;
	}
}

export class DefaultThreadProvider implements ThreadProvider {
	private appState: AppState | null = null;
	private wsClient: ThreadWebSocketClient | null = null;
	private wsConnecting: Promise<void> | null = null;
	private threadIDProvider: ThreadIDProvider | null = null;

	async initialize(appState: AppState): Promise<void> {
		this.appState = appState;
		this.threadIDProvider = new DefaultThreadIDProvider();

		// Initialize WebSocket connection for thread persistence (async, non-blocking)
		const apiKey = process.env.AGENTUITY_SDK_KEY;
		if (apiKey) {
			const serviceUrls = getServiceUrls(process.env.AGENTUITY_REGION ?? 'usc');
			const catalystUrl = serviceUrls.catalyst;
			const wsUrl = new URL('/thread/ws', catalystUrl.replace(/^http/, 'ws'));
			console.debug('connecting to %s', wsUrl);

			this.wsClient = new ThreadWebSocketClient(apiKey, wsUrl.toString());
			// Connect in background, don't block initialization
			this.wsConnecting = this.wsClient
				.connect()
				.then(() => {
					this.wsConnecting = null;
				})
				.catch((err) => {
					console.error('Failed to connect to thread WebSocket:', err);
					this.wsClient = null;
					this.wsConnecting = null;
				});
		}
	}

	setThreadIDProvider(provider: ThreadIDProvider): void {
		this.threadIDProvider = provider;
	}

	async restore(ctx: Context<Env>): Promise<Thread> {
		const threadId = this.threadIDProvider!.getThreadId(this.appState!, ctx);

		if (!threadId) {
			throw new Error(`the ThreadIDProvider returned an empty thread id for getThreadId`);
		}
		if (!threadId.startsWith('thrd_')) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must start with the prefix 'thrd_'.`
			);
		}
		if (threadId.length > 64) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must be less than 64 characters long.`
			);
		}
		if (threadId.length < 32) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must be at least 32 characters long.`
			);
		}
		if (!validThreadIdCharacters.test(threadId.substring(5))) {
			throw new Error(
				`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must contain only characters that match the regular expression [a-zA-Z0-9-].`
			);
		}

		// Wait for WebSocket connection if still connecting
		if (this.wsConnecting) {
			await this.wsConnecting;
		}

		// Restore thread state from WebSocket if available
		let initialStateJson: string | undefined;
		if (this.wsClient) {
			try {
				const restoredData = await this.wsClient.restore(threadId);
				if (restoredData) {
					initialStateJson = restoredData;
				}
			} catch {
				// Continue with empty state rather than failing
			}
		}

		const thread = new DefaultThread(this, threadId, initialStateJson);

		// Populate thread state from restored data
		if (initialStateJson) {
			try {
				const data = JSON.parse(initialStateJson);
				for (const [key, value] of Object.entries(data)) {
					thread.state.set(key, value);
				}
			} catch {
				// Continue with empty state if parsing fails
			}
		}

		await fireEvent('thread.created', thread);
		return thread;
	}

	async save(thread: Thread): Promise<void> {
		if (thread instanceof DefaultThread) {
			// Wait for WebSocket connection if still connecting
			if (this.wsConnecting) {
				await this.wsConnecting;
			}

			// Only save to WebSocket if state has changed
			if (this.wsClient && thread.isDirty()) {
				try {
					const serialized = thread.getSerializedState();
					await this.wsClient.save(thread.id, serialized);
				} catch {
					// Don't throw - allow request to complete even if save fails
				}
			}
		}
	}

	async destroy(thread: Thread): Promise<void> {
		if (thread instanceof DefaultThread) {
			try {
				// Wait for WebSocket connection if still connecting
				if (this.wsConnecting) {
					await this.wsConnecting;
				}

				// Delete thread from remote storage
				if (this.wsClient) {
					try {
						await this.wsClient.delete(thread.id);
					} catch {
						// Thread might not exist in remote storage if it was never persisted
						// This is normal for ephemeral threads, so just log at debug level
						internal.debug(
							`Thread ${thread.id} not found in remote storage (already deleted or never persisted)`
						);
						// Continue with local cleanup even if remote delete fails
					}
				}

				await thread.fireEvent('destroyed');
				await fireEvent('thread.destroyed', thread);
			} finally {
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
