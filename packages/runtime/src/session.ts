/* eslint-disable @typescript-eslint/no-explicit-any */
/** biome-ignore-all lint/suspicious/noExplicitAny: anys are great */
import type { Context } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { type Env, fireEvent } from './app';
import type { AppState } from './index';
import { getServiceUrls } from '@agentuity/server';
import { internal } from './logger/internal';
import { timingSafeEqual } from 'node:crypto';

/**
 * Result of parsing serialized thread data.
 * @internal
 */
export interface ParsedThreadData {
	flatStateJson?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Parse serialized thread data, handling both old (flat state) and new ({ state, metadata }) formats.
 * @internal
 */
export function parseThreadData(raw: string | undefined): ParsedThreadData {
	if (!raw) {
		return {};
	}

	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && ('state' in parsed || 'metadata' in parsed)) {
			return {
				flatStateJson: parsed.state ? JSON.stringify(parsed.state) : undefined,
				metadata:
					parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : undefined,
			};
		}
		return { flatStateJson: raw };
	} catch {
		return { flatStateJson: raw };
	}
}

export type ThreadEventName = 'destroyed';
export type SessionEventName = 'completed';

/**
 * Represents a merge operation for thread state.
 * Used when state is modified without being loaded first.
 */
export interface MergeOperation {
	op: 'set' | 'delete' | 'clear' | 'push';
	key?: string;
	value?: unknown;
	maxRecords?: number;
}

/**
 * Async thread state storage with lazy loading.
 *
 * State is only fetched from storage when first accessed via a read operation.
 * Write operations can be batched and sent as a merge command without loading.
 *
 * @example
 * ```typescript
 * // Read triggers lazy load
 * const count = await ctx.thread.state.get<number>('messageCount');
 *
 * // Write queues operation (may not trigger load)
 * await ctx.thread.state.set('messageCount', (count ?? 0) + 1);
 *
 * // Check state status
 * if (ctx.thread.state.dirty) {
 *   console.log('State has pending changes');
 * }
 * ```
 */
export interface ThreadState {
	/**
	 * Whether state has been loaded from storage.
	 * True when state has been fetched via a read operation.
	 */
	readonly loaded: boolean;

	/**
	 * Whether state has pending changes.
	 * True when there are queued writes (pending-writes state) or
	 * modifications after loading (loaded state with changes).
	 */
	readonly dirty: boolean;

	/**
	 * Get a value from thread state.
	 * Triggers lazy load if state hasn't been fetched yet.
	 */
	get<T = unknown>(key: string): Promise<T | undefined>;

	/**
	 * Set a value in thread state.
	 * If state hasn't been loaded, queues the operation for merge.
	 */
	set<T = unknown>(key: string, value: T): Promise<void>;

	/**
	 * Check if a key exists in thread state.
	 * Triggers lazy load if state hasn't been fetched yet.
	 */
	has(key: string): Promise<boolean>;

	/**
	 * Delete a key from thread state.
	 * If state hasn't been loaded, queues the operation for merge.
	 */
	delete(key: string): Promise<void>;

	/**
	 * Clear all thread state.
	 * If state hasn't been loaded, queues a clear operation for merge.
	 */
	clear(): Promise<void>;

	/**
	 * Get all entries as key-value pairs.
	 * Triggers lazy load if state hasn't been fetched yet.
	 */
	entries<T = unknown>(): Promise<[string, T][]>;

	/**
	 * Get all keys.
	 * Triggers lazy load if state hasn't been fetched yet.
	 */
	keys(): Promise<string[]>;

	/**
	 * Get all values.
	 * Triggers lazy load if state hasn't been fetched yet.
	 */
	values<T = unknown>(): Promise<T[]>;

	/**
	 * Get the number of entries in state.
	 * Triggers lazy load if state hasn't been fetched yet.
	 */
	size(): Promise<number>;

	/**
	 * Push a value to an array in thread state.
	 * If the key doesn't exist, creates a new array with the value.
	 * If state hasn't been loaded, queues the operation for efficient merge.
	 *
	 * @param key - The key of the array to push to
	 * @param value - The value to push
	 * @param maxRecords - Optional maximum number of records to keep (sliding window)
	 *
	 * @example
	 * ```typescript
	 * // Efficiently append messages without loading entire array
	 * await ctx.thread.state.push('messages', { role: 'user', content: 'Hello' });
	 * await ctx.thread.state.push('messages', { role: 'assistant', content: 'Hi!' });
	 *
	 * // Keep only the last 100 messages
	 * await ctx.thread.state.push('messages', newMessage, 100);
	 * ```
	 */
	push<T = unknown>(key: string, value: T, maxRecords?: number): Promise<void>;
}

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
 *     const count = await ctx.thread.state.get<number>('conversationCount') ?? 0;
 *     await ctx.thread.state.set('conversationCount', count + 1);
 *
 *     // Access metadata
 *     const meta = await ctx.thread.getMetadata();
 *     await ctx.thread.setMetadata({ ...meta, lastAccess: Date.now() });
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
	 * Thread-scoped state storage with async lazy-loading.
	 * State is only fetched from storage when first accessed via a read operation.
	 *
	 * @example
	 * ```typescript
	 * // Read triggers lazy load
	 * const count = await ctx.thread.state.get<number>('messageCount');
	 * // Write may queue operation without loading
	 * await ctx.thread.state.set('messageCount', (count ?? 0) + 1);
	 * ```
	 */
	state: ThreadState;

	/**
	 * Get thread metadata (lazy-loaded).
	 * Unlike state, metadata is stored unencrypted for efficient filtering.
	 *
	 * @example
	 * ```typescript
	 * const meta = await ctx.thread.getMetadata();
	 * console.log(meta.userId);
	 * ```
	 */
	getMetadata(): Promise<Record<string, unknown>>;

	/**
	 * Set thread metadata (full replace).
	 *
	 * @example
	 * ```typescript
	 * await ctx.thread.setMetadata({ userId: 'user123', department: 'sales' });
	 * ```
	 */
	setMetadata(metadata: Record<string, unknown>): Promise<void>;

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
	 * This is async because it may need to check lazy-loaded state.
	 *
	 * @example
	 * ```typescript
	 * if (await ctx.thread.empty()) {
	 *   // Thread has no data, won't be persisted
	 * }
	 * ```
	 */
	empty(): Promise<boolean>;
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
	 * Unencrypted metadata for filtering and querying sessions.
	 * Unlike state, metadata is stored as-is in the database with GIN indexes
	 * for efficient filtering. Initialized to empty object, only persisted if non-empty.
	 *
	 * @example
	 * ```typescript
	 * ctx.session.metadata.userId = 'user123';
	 * ctx.session.metadata.requestType = 'chat';
	 * ```
	 */
	metadata: Record<string, unknown>;

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
	 * regular expression [a-zA-Z0-9].
	 *
	 * @param appState - The app state from createApp setup function
	 * @param ctx - Hono request context
	 * @returns The thread id to use (can be async for signed cookies)
	 */
	getThreadId(appState: AppState, ctx: Context<Env>): string | Promise<string>;
}

/**
 * Provider interface for managing thread lifecycle and persistence.
 * Implement this to customize how threads are stored and retrieved.
 *
 * The default implementation (DefaultThreadProvider) stores threads in-memory
 * with cookie-based identification and 1-hour expiration.
 *
 * Thread state is serialized using `getSerializedState()` which returns a JSON
 * envelope: `{ "state": {...}, "metadata": {...} }`. Use `parseThreadData()` to
 * correctly parse both old (flat) and new (envelope) formats on restore.
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
 *     const threadId = ctx.req.header('x-thread-id') || getCookie(ctx, 'atid') || generateId('thrd');
 *     const data = await this.redis.get(`thread:${threadId}`);
 *
 *     // Parse stored data, handling both old and new formats
 *     const { flatStateJson, metadata } = parseThreadData(data);
 *     const thread = new DefaultThread(this, threadId, flatStateJson, metadata);
 *
 *     // Populate state from parsed data
 *     if (flatStateJson) {
 *       const stateObj = JSON.parse(flatStateJson);
 *       for (const [key, value] of Object.entries(stateObj)) {
 *         thread.state.set(key, value);
 *       }
 *     }
 *     return thread;
 *   }
 *
 *   async save(thread: Thread): Promise<void> {
 *     if (thread instanceof DefaultThread && thread.isDirty()) {
 *       await this.redis.setex(
 *         `thread:${thread.id}`,
 *         3600,
 *         thread.getSerializedState()
 *       );
 *     }
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

/**
 * Validates a thread ID against runtime constraints:
 * - Must start with 'thrd_'
 * - Must be at least 32 characters long (including prefix)
 * - Must be less than 64 characters long
 * - Must contain only [a-zA-Z0-9] after 'thrd_' prefix (no dashes for maximum randomness)
 */
export function isValidThreadId(threadId: string): boolean {
	if (!threadId.startsWith('thrd_')) {
		return false;
	}
	if (threadId.length < 32 || threadId.length > 64) {
		return false;
	}
	const validThreadIdCharacters = /^[a-zA-Z0-9]+$/;
	if (!validThreadIdCharacters.test(threadId.substring(5))) {
		return false;
	}
	return true;
}

/**
 * Validates a thread ID and throws detailed error messages for debugging.
 * @param threadId The thread ID to validate
 * @throws Error with detailed message if validation fails
 */
export function validateThreadIdOrThrow(threadId: string): void {
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
	const validThreadIdCharacters = /^[a-zA-Z0-9]+$/;
	if (!validThreadIdCharacters.test(threadId.substring(5))) {
		throw new Error(
			`the ThreadIDProvider returned an invalid thread id (${threadId}) for getThreadId. The thread id must contain only characters that match the regular expression [a-zA-Z0-9].`
		);
	}
}

/**
 * Determines if the connection is secure (HTTPS) by checking the request protocol
 * and x-forwarded-proto header (for reverse proxy scenarios).
 * Defaults to false (HTTP) if unable to determine.
 */
export function isSecureConnection(ctx: Context<Env>): boolean {
	// Check x-forwarded-proto header first (reverse proxy)
	const forwardedProto = ctx.req.header('x-forwarded-proto');
	if (forwardedProto) {
		return forwardedProto === 'https';
	}

	// Check the request URL protocol if available
	try {
		if (ctx.req.url) {
			const url = new URL(ctx.req.url);
			return url.protocol === 'https:';
		}
	} catch {
		// Fall through to default
	}

	// Default to HTTP (e.g., for localhost development)
	return false;
}

/**
 * Signs a thread ID using HMAC SHA-256 and returns it in the format: threadId;signature
 * Format: thrd_abc123;base64signature
 */
export async function signThreadId(threadId: string, secret: string): Promise<string> {
	const hasher = new Bun.CryptoHasher('sha256', secret);
	hasher.update(threadId);
	const signatureBase64 = hasher.digest('base64');

	return `${threadId};${signatureBase64}`;
}

/**
 * Verifies a signed thread ID header and returns the thread ID if valid, or undefined if invalid.
 * Expected format: thrd_abc123;base64signature
 */
export async function verifySignedThreadId(
	signedValue: string,
	secret: string
): Promise<string | undefined> {
	const parts = signedValue.split(';');
	if (parts.length !== 2) {
		return undefined;
	}

	const [threadId, providedSignature] = parts;

	// Validate both parts exist
	if (!threadId || !providedSignature) {
		return undefined;
	}

	// Validate thread ID format before verifying signature
	if (!isValidThreadId(threadId)) {
		return undefined;
	}

	// Re-sign the thread ID and compare signatures
	const expectedSigned = await signThreadId(threadId, secret);
	const expectedSignature = expectedSigned.split(';')[1];

	// Validate signature exists
	if (!expectedSignature) {
		return undefined;
	}

	// Constant-time comparison to prevent timing attacks
	// Check lengths match first (fail fast if different lengths)
	if (providedSignature.length !== expectedSignature.length) {
		return undefined;
	}

	try {
		// Convert to Buffers for constant-time comparison
		const providedBuffer = Buffer.from(providedSignature, 'base64');
		const expectedBuffer = Buffer.from(expectedSignature, 'base64');

		if (timingSafeEqual(providedBuffer, expectedBuffer)) {
			return threadId;
		}
	} catch {
		// Comparison failed or buffer conversion error
		return undefined;
	}

	return undefined;
}

/**
 * DefaultThreadIDProvider will look for an HTTP header `x-thread-id` first,
 * then fall back to a signed cookie named `atid`, and use that as the thread id.
 * If not found, generate a new one. Validates incoming thread IDs against
 * runtime constraints. Uses AGENTUITY_SDK_KEY for signing, falls back to 'agentuity'.
 */
export class DefaultThreadIDProvider implements ThreadIDProvider {
	private getSecret(): string {
		return process.env.AGENTUITY_SDK_KEY || 'agentuity';
	}

	async getThreadId(_appState: AppState, ctx: Context<Env>): Promise<string> {
		let threadId: string | undefined;
		const secret = this.getSecret();

		// Check signed header first
		const headerValue = ctx.req.header('x-thread-id');
		if (headerValue) {
			const verifiedThreadId = await verifySignedThreadId(headerValue, secret);
			if (verifiedThreadId) {
				threadId = verifiedThreadId;
			}
		}

		// Fall back to signed cookie
		if (!threadId) {
			const cookieValue = await getSignedCookie(ctx, secret, 'atid');
			if (cookieValue && typeof cookieValue === 'string' && isValidThreadId(cookieValue)) {
				threadId = cookieValue;
			}
		}

		threadId = threadId || generateId('thrd');

		await setSignedCookie(ctx, 'atid', threadId, secret, {
			httpOnly: true,
			secure: isSecureConnection(ctx),
			sameSite: 'Lax',
			path: '/',
			maxAge: 604800, // 1 week in seconds
		});

		// Set signed header in response
		const signedHeader = await signThreadId(threadId, secret);
		ctx.header('x-thread-id', signedHeader);
		return threadId;
	}
}

type LazyStateStatus = 'idle' | 'pending-writes' | 'loaded';

type RestoreFn = () => Promise<{ state: Map<string, unknown>; metadata: Record<string, unknown> }>;

export class LazyThreadState implements ThreadState {
	#status: LazyStateStatus = 'idle';
	#state: Map<string, unknown> = new Map();
	#pendingOperations: MergeOperation[] = [];
	#initialStateJson: string | undefined;
	#restoreFn: RestoreFn;
	#loadingPromise: Promise<void> | null = null;

	constructor(restoreFn: RestoreFn) {
		this.#restoreFn = restoreFn;
	}

	get loaded(): boolean {
		return this.#status === 'loaded';
	}

	get dirty(): boolean {
		if (this.#status === 'pending-writes') {
			return this.#pendingOperations.length > 0;
		}
		if (this.#status === 'loaded') {
			const currentJson = JSON.stringify(Object.fromEntries(this.#state));
			return currentJson !== this.#initialStateJson;
		}
		return false;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.#status === 'loaded') {
			return;
		}

		if (this.#loadingPromise) {
			await this.#loadingPromise;
			return;
		}

		this.#loadingPromise = (async () => {
			try {
				await this.doLoad();
			} finally {
				this.#loadingPromise = null;
			}
		})();

		await this.#loadingPromise;
	}

	private async doLoad(): Promise<void> {
		const { state } = await this.#restoreFn();

		// Initialize state from restored data
		this.#state = new Map(state);
		this.#initialStateJson = JSON.stringify(Object.fromEntries(this.#state));

		// Apply any pending operations
		for (const op of this.#pendingOperations) {
			switch (op.op) {
				case 'clear':
					this.#state.clear();
					break;
				case 'set':
					if (op.key !== undefined) {
						this.#state.set(op.key, op.value);
					}
					break;
				case 'delete':
					if (op.key !== undefined) {
						this.#state.delete(op.key);
					}
					break;
				case 'push':
					if (op.key !== undefined) {
						const existing = this.#state.get(op.key);
						if (Array.isArray(existing)) {
							existing.push(op.value);
							// Apply maxRecords limit
							if (op.maxRecords !== undefined && existing.length > op.maxRecords) {
								existing.splice(0, existing.length - op.maxRecords);
							}
						} else if (existing === undefined) {
							this.#state.set(op.key, [op.value]);
						}
						// If existing is non-array, silently skip (error would have been thrown if loaded)
					}
					break;
			}
		}

		this.#pendingOperations = [];
		this.#status = 'loaded';
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		await this.ensureLoaded();
		return this.#state.get(key) as T | undefined;
	}

	async set<T = unknown>(key: string, value: T): Promise<void> {
		if (this.#status === 'loaded') {
			this.#state.set(key, value);
		} else {
			this.#pendingOperations.push({ op: 'set', key, value });
			if (this.#status === 'idle') {
				this.#status = 'pending-writes';
			}
		}
	}

	async has(key: string): Promise<boolean> {
		await this.ensureLoaded();
		return this.#state.has(key);
	}

	async delete(key: string): Promise<void> {
		if (this.#status === 'loaded') {
			this.#state.delete(key);
		} else {
			this.#pendingOperations.push({ op: 'delete', key });
			if (this.#status === 'idle') {
				this.#status = 'pending-writes';
			}
		}
	}

	async clear(): Promise<void> {
		if (this.#status === 'loaded') {
			this.#state.clear();
		} else {
			// Clear replaces all previous pending operations
			this.#pendingOperations = [{ op: 'clear' }];
			if (this.#status === 'idle') {
				this.#status = 'pending-writes';
			}
		}
	}

	async entries<T = unknown>(): Promise<[string, T][]> {
		await this.ensureLoaded();
		return Array.from(this.#state.entries()) as [string, T][];
	}

	async keys(): Promise<string[]> {
		await this.ensureLoaded();
		return Array.from(this.#state.keys());
	}

	async values<T = unknown>(): Promise<T[]> {
		await this.ensureLoaded();
		return Array.from(this.#state.values()) as T[];
	}

	async size(): Promise<number> {
		await this.ensureLoaded();
		return this.#state.size;
	}

	async push<T = unknown>(key: string, value: T, maxRecords?: number): Promise<void> {
		if (this.#status === 'loaded') {
			// When loaded, push to local array
			const existing = this.#state.get(key);
			if (Array.isArray(existing)) {
				existing.push(value);
				// Apply maxRecords limit
				if (maxRecords !== undefined && existing.length > maxRecords) {
					existing.splice(0, existing.length - maxRecords);
				}
			} else if (existing === undefined) {
				this.#state.set(key, [value]);
			} else {
				throw new Error(`Cannot push to non-array value at key "${key}"`);
			}
		} else {
			// Queue push operation for merge
			const op: MergeOperation = { op: 'push', key, value };
			if (maxRecords !== undefined) {
				op.maxRecords = maxRecords;
			}
			this.#pendingOperations.push(op);
			if (this.#status === 'idle') {
				this.#status = 'pending-writes';
			}
		}
	}

	/**
	 * Get the current status for save logic
	 * @internal
	 */
	getStatus(): LazyStateStatus {
		return this.#status;
	}

	/**
	 * Get pending operations for merge command
	 * @internal
	 */
	getPendingOperations(): MergeOperation[] {
		return [...this.#pendingOperations];
	}

	/**
	 * Get serialized state for full save.
	 * Ensures state is loaded before serializing.
	 * @internal
	 */
	async getSerializedState(): Promise<Record<string, unknown>> {
		await this.ensureLoaded();
		return Object.fromEntries(this.#state);
	}
}

export class DefaultThread implements Thread {
	readonly id: string;
	readonly state: LazyThreadState;
	#metadata: Record<string, unknown> | null = null;
	#metadataDirty = false;
	#metadataLoadPromise: Promise<void> | null = null;
	private provider: ThreadProvider;
	#restoreFn: RestoreFn;
	#restoredMetadata: Record<string, unknown> | undefined;

	constructor(
		provider: ThreadProvider,
		id: string,
		restoreFn: RestoreFn,
		initialMetadata?: Record<string, unknown>
	) {
		this.provider = provider;
		this.id = id;
		this.#restoreFn = restoreFn;
		this.#restoredMetadata = initialMetadata;
		this.state = new LazyThreadState(restoreFn);
	}

	private async ensureMetadataLoaded(): Promise<void> {
		if (this.#metadata !== null) {
			return;
		}

		// If we have initial metadata from thread creation, use it
		if (this.#restoredMetadata !== undefined) {
			this.#metadata = this.#restoredMetadata;
			return;
		}

		if (this.#metadataLoadPromise) {
			await this.#metadataLoadPromise;
			return;
		}

		this.#metadataLoadPromise = (async () => {
			try {
				await this.doLoadMetadata();
			} finally {
				this.#metadataLoadPromise = null;
			}
		})();

		await this.#metadataLoadPromise;
	}

	private async doLoadMetadata(): Promise<void> {
		const { metadata } = await this.#restoreFn();
		this.#metadata = metadata;
	}

	async getMetadata(): Promise<Record<string, unknown>> {
		await this.ensureMetadataLoaded();
		return { ...this.#metadata! };
	}

	async setMetadata(metadata: Record<string, unknown>): Promise<void> {
		this.#metadata = metadata;
		this.#metadataDirty = true;
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
	 * Check if thread has any data (state or metadata)
	 */
	async empty(): Promise<boolean> {
		const stateSize = await this.state.size();
		// Check both loaded metadata and initial metadata from constructor
		const meta = this.#metadata ?? this.#restoredMetadata ?? {};
		return stateSize === 0 && Object.keys(meta).length === 0;
	}

	/**
	 * Check if thread needs saving
	 * @internal
	 */
	needsSave(): boolean {
		return this.state.dirty || this.#metadataDirty;
	}

	/**
	 * Get the save mode for this thread
	 * @internal
	 */
	getSaveMode(): 'none' | 'merge' | 'full' {
		const stateStatus = this.state.getStatus();

		if (stateStatus === 'idle' && !this.#metadataDirty) {
			return 'none';
		}

		if (stateStatus === 'pending-writes') {
			return 'merge';
		}

		if (stateStatus === 'loaded' && (this.state.dirty || this.#metadataDirty)) {
			return 'full';
		}

		// Only metadata was changed without loading state
		if (this.#metadataDirty) {
			return 'merge';
		}

		return 'none';
	}

	/**
	 * Get pending operations for merge command
	 * @internal
	 */
	getPendingOperations(): MergeOperation[] {
		return this.state.getPendingOperations();
	}

	/**
	 * Get metadata for saving (returns null if not loaded/modified)
	 * @internal
	 */
	getMetadataForSave(): Record<string, unknown> | undefined {
		if (this.#metadataDirty && this.#metadata) {
			return this.#metadata;
		}
		return undefined;
	}

	/**
	 * Get serialized state for full save.
	 * Ensures state is loaded before serializing.
	 * @internal
	 */
	async getSerializedState(): Promise<string> {
		const state = await this.state.getSerializedState();
		// Also ensure metadata is loaded
		const meta = this.#metadata ?? this.#restoredMetadata ?? {};
		const hasState = Object.keys(state).length > 0;
		const hasMetadata = Object.keys(meta).length > 0;

		if (!hasState && !hasMetadata) {
			return '';
		}

		const data: { state?: Record<string, unknown>; metadata?: Record<string, unknown> } = {};

		if (hasState) {
			data.state = state;
		}

		if (hasMetadata) {
			data.metadata = meta;
		}

		return JSON.stringify(data);
	}
}

export class DefaultSession implements Session {
	readonly id: string;
	readonly thread: Thread;
	readonly state: Map<string, unknown>;
	metadata: Record<string, unknown>;

	constructor(thread: Thread, id: string, metadata?: Record<string, unknown>) {
		this.id = id;
		this.thread = thread;
		this.state = new Map();
		this.metadata = metadata || {};
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
/**
 * Configuration options for ThreadWebSocketClient
 */
export interface ThreadWebSocketClientOptions {
	/** Connection timeout in milliseconds (default: 10000) */
	connectionTimeoutMs?: number;
	/** Request timeout in milliseconds (default: 10000) */
	requestTimeoutMs?: number;
	/** Base delay for reconnection backoff in milliseconds (default: 1000) */
	reconnectBaseDelayMs?: number;
	/** Maximum delay for reconnection backoff in milliseconds (default: 30000) */
	reconnectMaxDelayMs?: number;
	/** Maximum number of reconnection attempts (default: 5) */
	maxReconnectAttempts?: number;
}

export class ThreadWebSocketClient {
	private ws: WebSocket | null = null;
	private authenticated = false;
	private pendingRequests = new Map<
		string,
		{ resolve: (data?: string) => void; reject: (err: Error) => void }
	>();
	private reconnectAttempts = 0;
	private maxReconnectAttempts: number;
	private apiKey: string;
	private wsUrl: string;
	private wsConnecting: Promise<void> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private isDisposed = false;
	private initialConnectResolve: (() => void) | null = null;
	private initialConnectReject: ((err: Error) => void) | null = null;
	private connectionTimeoutMs: number;
	private requestTimeoutMs: number;
	private reconnectBaseDelayMs: number;
	private reconnectMaxDelayMs: number;

	constructor(apiKey: string, wsUrl: string, options: ThreadWebSocketClientOptions = {}) {
		this.apiKey = apiKey;
		this.wsUrl = wsUrl;
		this.connectionTimeoutMs = options.connectionTimeoutMs ?? 10_000;
		this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
		this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1_000;
		this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30_000;
		this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
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
				rejectFn(new Error(`WebSocket connection timeout (${this.connectionTimeoutMs}ms)`));
			}, this.connectionTimeoutMs);

			try {
				this.ws = new WebSocket(this.wsUrl);

				this.ws.addEventListener('open', () => {
					// Send authentication (do NOT clear timeout yet - wait for auth response)
					this.ws?.send(JSON.stringify({ authorization: this.apiKey }));
				});

				this.ws.addEventListener('message', (event: MessageEvent) => {
					try {
						const message = JSON.parse(event.data);

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

				this.ws.addEventListener('error', (_event: Event) => {
					clearTimeout(connectionTimeout);
					if (!this.authenticated) {
						// Don't reject immediately if we'll attempt reconnection
						if (this.reconnectAttempts >= this.maxReconnectAttempts || this.isDisposed) {
							const rejectFn = this.initialConnectReject || reject;
							this.initialConnectResolve = null;
							this.initialConnectReject = null;
							rejectFn(new Error(`WebSocket error`));
						}
					}
				});

				this.ws.addEventListener('close', () => {
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
						const delay = Math.min(
							this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts),
							this.reconnectMaxDelayMs
						);

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

			// Timeout after configured duration
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error('Request timeout'));
				}
			}, this.requestTimeoutMs);
		});
	}

	async save(
		threadId: string,
		userData: string,
		threadMetadata?: Record<string, unknown>
	): Promise<void> {
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

			const data: { thread_id: string; user_data: string; metadata?: Record<string, unknown> } =
				{
					thread_id: threadId,
					user_data: userData,
				};

			if (threadMetadata && Object.keys(threadMetadata).length > 0) {
				data.metadata = threadMetadata;
			}

			const message = {
				id: requestId,
				action: 'save',
				data,
			};

			this.ws!.send(JSON.stringify(message));

			// Timeout after configured duration
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error('Request timeout'));
				}
			}, this.requestTimeoutMs);
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

			// Timeout after configured duration
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error('Request timeout'));
				}
			}, this.requestTimeoutMs);
		});
	}

	async merge(
		threadId: string,
		operations: MergeOperation[],
		metadata?: Record<string, unknown>
	): Promise<void> {
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

			const data: {
				thread_id: string;
				operations: MergeOperation[];
				metadata?: Record<string, unknown>;
			} = {
				thread_id: threadId,
				operations,
			};

			if (metadata && Object.keys(metadata).length > 0) {
				data.metadata = metadata;
			}

			const message = {
				id: requestId,
				action: 'merge',
				data,
			};

			this.ws!.send(JSON.stringify(message));

			// Timeout after configured duration
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error('Request timeout'));
				}
			}, this.requestTimeoutMs);
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
			internal.debug('connecting to %s', wsUrl);

			this.wsClient = new ThreadWebSocketClient(apiKey, wsUrl.toString());
			// Connect in background, don't block initialization
			this.wsConnecting = this.wsClient
				.connect()
				.then(() => {
					this.wsConnecting = null;
				})
				.catch((err) => {
					internal.error('Failed to connect to thread WebSocket:', err);
					this.wsClient = null;
					this.wsConnecting = null;
				});
		}
	}

	setThreadIDProvider(provider: ThreadIDProvider): void {
		this.threadIDProvider = provider;
	}

	async restore(ctx: Context<Env>): Promise<Thread> {
		const threadId = await this.threadIDProvider!.getThreadId(this.appState!, ctx);
		validateThreadIdOrThrow(threadId);
		internal.info('[thread] creating lazy thread %s (no eager restore)', threadId);

		// Create a restore function that will be called lazily when state/metadata is accessed
		const restoreFn = async (): Promise<{
			state: Map<string, unknown>;
			metadata: Record<string, unknown>;
		}> => {
			internal.info('[thread] lazy loading state for thread %s', threadId);

			// Wait for WebSocket connection if still connecting
			if (this.wsConnecting) {
				internal.info('[thread] waiting for WebSocket connection');
				await this.wsConnecting;
			}

			if (!this.wsClient) {
				internal.info('[thread] no WebSocket client available, returning empty state');
				return { state: new Map(), metadata: {} };
			}

			try {
				const restoredData = await this.wsClient.restore(threadId);
				if (restoredData) {
					internal.info('[thread] restored state: %d bytes', restoredData.length);
					const { flatStateJson, metadata } = parseThreadData(restoredData);

					const state = new Map<string, unknown>();
					if (flatStateJson) {
						try {
							const data = JSON.parse(flatStateJson);
							for (const [key, value] of Object.entries(data)) {
								state.set(key, value);
							}
						} catch {
							internal.info('[thread] failed to parse state JSON');
						}
					}

					return { state, metadata: metadata || {} };
				}
				internal.info('[thread] no existing state found');
				return { state: new Map(), metadata: {} };
			} catch (err) {
				internal.info('[thread] WebSocket restore failed: %s', err);
				return { state: new Map(), metadata: {} };
			}
		};

		const thread = new DefaultThread(this, threadId, restoreFn);
		await fireEvent('thread.created', thread);
		return thread;
	}

	async save(thread: Thread): Promise<void> {
		if (thread instanceof DefaultThread) {
			const saveMode = thread.getSaveMode();
			internal.info(
				'[thread] DefaultThreadProvider.save() - thread %s, saveMode: %s, hasWsClient: %s',
				thread.id,
				saveMode,
				!!this.wsClient
			);

			if (saveMode === 'none') {
				internal.info('[thread] skipping save - no changes');
				return;
			}

			// Wait for WebSocket connection if still connecting
			if (this.wsConnecting) {
				internal.info('[thread] waiting for WebSocket connection');
				await this.wsConnecting;
			}

			if (!this.wsClient) {
				internal.info('[thread] no WebSocket client available, skipping save');
				return;
			}

			try {
				if (saveMode === 'merge') {
					const operations = thread.getPendingOperations();
					const metadata = thread.getMetadataForSave();
					internal.info(
						'[thread] sending merge command with %d operations',
						operations.length
					);
					await this.wsClient.merge(thread.id, operations, metadata);
					internal.info('[thread] WebSocket merge completed');
				} else if (saveMode === 'full') {
					const serialized = await thread.getSerializedState();
					internal.info('[thread] saving to WebSocket, serialized length: %d', serialized.length);
					const metadata = thread.getMetadataForSave();
					await this.wsClient.save(thread.id, serialized, metadata);
					internal.info('[thread] WebSocket save completed');
				}
			} catch (err) {
				internal.info('[thread] WebSocket save/merge failed: %s', err);
				// Don't throw - allow request to complete even if save fails
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
		internal.info('[session] restoring session %s for thread %s', sessionId, thread.id);
		let session = this.sessions.get(sessionId);
		if (!session) {
			session = new DefaultSession(thread, sessionId);
			this.sessions.set(sessionId, session);
			internal.info('[session] created new session, firing session.started');
			await fireEvent('session.started', session);
		} else {
			internal.info('[session] found existing session');
		}
		return session;
	}

	async save(session: Session): Promise<void> {
		if (session instanceof DefaultSession) {
			internal.info(
				'[session] DefaultSessionProvider.save() - firing completed event for session %s',
				session.id
			);
			try {
				await session.fireEvent('completed');
				internal.info('[session] session.fireEvent completed, firing app event');
				await fireEvent('session.completed', session);
				internal.info('[session] session.completed app event fired');
			} finally {
				this.sessions.delete(session.id);
				sessionEventListeners.delete(session);
			}
		}
	}
}
