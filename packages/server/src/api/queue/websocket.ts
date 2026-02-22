/**
 * @module websocket
 *
 * WebSocket client for real-time queue message subscriptions.
 *
 * Provides both a callback-based API ({@link createQueueWebSocket}) and an
 * async iterator API ({@link subscribeToQueue}) for receiving messages from
 * a queue in real time via WebSocket.
 *
 * @example Callback-based API
 * ```typescript
 * import { createQueueWebSocket } from '@agentuity/server';
 *
 * const connection = createQueueWebSocket({
 *     queueName: 'order-processing',
 *     baseUrl: 'https://catalyst.agentuity.cloud',
 *     onMessage: (message) => {
 *         console.log('Received:', message.id, message.payload);
 *     },
 *     onOpen: () => console.log('Connected'),
 *     onClose: (code, reason) => console.log('Closed:', code, reason),
 *     onError: (error) => console.error('Error:', error),
 * });
 *
 * // Later: close the connection
 * connection.close();
 * ```
 *
 * @example Async iterator API
 * ```typescript
 * import { subscribeToQueue } from '@agentuity/server';
 *
 * const controller = new AbortController();
 * for await (const message of subscribeToQueue({
 *     queueName: 'order-processing',
 *     baseUrl: 'https://catalyst.agentuity.cloud',
 *     signal: controller.signal,
 * })) {
 *     console.log('Received:', message.id, message.payload);
 * }
 * ```
 */

import type { Message } from './types';
import { WebSocketAuthResponseSchema, WebSocketMessageSchema } from './types';
import { QueueError } from './util';
import { validateQueueName } from './validation';

// ============================================================================
// Types
// ============================================================================

/** Connection state for a queue WebSocket connection. */
export type QueueWebSocketState =
	| 'connecting'
	| 'authenticating'
	| 'connected'
	| 'reconnecting'
	| 'closed';

/** Options for creating a queue WebSocket subscription. */
export interface QueueWebSocketOptions {
	/** Queue name to subscribe to. */
	queueName: string;
	/** API key for authentication (if not provided, uses AGENTUITY_SDK_KEY env var). */
	apiKey?: string;
	/** Base URL of the catalyst service (e.g., https://catalyst.agentuity.cloud). */
	baseUrl: string;
	/** Called when a message is received. */
	onMessage: (message: Message) => void;
	/** Called when the connection is established and authenticated. */
	onOpen?: () => void;
	/** Called when the connection is closed. */
	onClose?: (code: number, reason: string) => void;
	/** Called when an error occurs. */
	onError?: (error: Error) => void;
	/** Whether to automatically reconnect on disconnection (default: true). */
	autoReconnect?: boolean;
	/** Maximum number of reconnection attempts (default: Infinity). */
	maxReconnectAttempts?: number;
	/** Initial reconnection delay in ms (default: 1000). Uses exponential backoff. */
	reconnectDelayMs?: number;
	/** Maximum reconnection delay in ms (default: 30000). */
	maxReconnectDelayMs?: number;
}

/** Return type from {@link createQueueWebSocket}. */
export interface QueueWebSocketConnection {
	/** Close the WebSocket connection. Disables auto-reconnect. */
	close(): void;
	/** The current connection state. */
	readonly state: QueueWebSocketState;
	/** The client/subscription ID assigned by the server. Stable across reconnections. */
	readonly clientId: string | undefined;
	/** The offset of the last message processed. */
	readonly lastOffset: number | undefined;
}

/** Options for the async iterator queue subscription. */
export interface SubscribeToQueueOptions {
	/** Queue name to subscribe to. */
	queueName: string;
	/** API key for authentication (if not provided, uses AGENTUITY_SDK_KEY env var). */
	apiKey?: string;
	/** Base URL of the catalyst service. */
	baseUrl: string;
	/** AbortSignal to stop the subscription. */
	signal?: AbortSignal;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Resolve the API key from the options or the AGENTUITY_SDK_KEY environment variable.
 * Throws a {@link QueueError} if no API key is available.
 */
function resolveApiKey(apiKey?: string): string {
	const key = apiKey ?? process.env.AGENTUITY_SDK_KEY;
	if (!key) {
		throw new QueueError({
			message:
				'No API key provided. Pass apiKey in options or set the AGENTUITY_SDK_KEY environment variable.',
		});
	}
	return key;
}

/**
 * Convert an HTTP(S) base URL to a WebSocket URL and append the queue path.
 *
 * The WebSocket route is registered at `/queue/ws/{name}` (not versioned).
 */
function buildWebSocketUrl(baseUrl: string, queueName: string): string {
	const wsUrl = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
	// Remove trailing slash if present
	const base = wsUrl.replace(/\/$/, '');
	return `${base}/queue/ws/${encodeURIComponent(queueName)}`;
}

// ============================================================================
// Callback-based API
// ============================================================================

/**
 * Create a WebSocket connection to receive real-time messages from a queue.
 *
 * The connection handles authentication, automatic reconnection with exponential
 * backoff, and ping/pong keep-alive (handled automatically by the WebSocket
 * implementation).
 *
 * @param options - Configuration for the WebSocket connection
 * @returns A {@link QueueWebSocketConnection} handle for managing the connection
 * @throws {QueueError} If no API key is available
 * @throws {QueueValidationError} If the queue name is invalid
 *
 * @example
 * ```typescript
 * const connection = createQueueWebSocket({
 *     queueName: 'order-processing',
 *     baseUrl: 'https://catalyst.agentuity.cloud',
 *     onMessage: (message) => {
 *         console.log('Received:', message.id, message.payload);
 *     },
 * });
 *
 * // Later: close the connection
 * connection.close();
 * ```
 */
export function createQueueWebSocket(options: QueueWebSocketOptions): QueueWebSocketConnection {
	// Validate inputs eagerly so callers get immediate feedback.
	validateQueueName(options.queueName);
	const apiKey = resolveApiKey(options.apiKey);

	const {
		queueName,
		baseUrl,
		onMessage,
		onOpen,
		onClose,
		onError,
		autoReconnect = true,
		maxReconnectAttempts = Infinity,
		reconnectDelayMs = 1000,
		maxReconnectDelayMs = 30000,
	} = options;

	let state: QueueWebSocketState = 'connecting';
	let ws: WebSocket | null = null;
	let intentionallyClosed = false;
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let clientId: string | undefined;
	let lastProcessedOffset: number | undefined;

	function connect() {
		if (intentionallyClosed) return;

		const url = buildWebSocketUrl(baseUrl, queueName);
		state = reconnectAttempts > 0 ? 'reconnecting' : 'connecting';

		try {
			ws = new WebSocket(url);
		} catch (err) {
			state = 'closed';
			onError?.(
				new QueueError({
					message: `Failed to create WebSocket connection: ${err instanceof Error ? err.message : String(err)}`,
					queueName,
					cause: err instanceof Error ? err : undefined,
				}),
			);
			scheduleReconnect();
			return;
		}

		ws.onopen = () => {
			state = 'authenticating';
			// Send auth message — raw API key, no "Bearer " prefix.
			// Include client_id and last_offset on reconnect for resumption.
			const authPayload: Record<string, unknown> = { authorization: apiKey };
			if (clientId) {
				authPayload.client_id = clientId;
			}
			if (lastProcessedOffset !== undefined) {
				authPayload.last_offset = lastProcessedOffset;
			}
			ws!.send(JSON.stringify(authPayload));
		};

		/** Whether the auth handshake has completed successfully. */
		let authenticated = false;

		ws.onmessage = (event: MessageEvent) => {
			const raw = typeof event.data === 'string' ? event.data : String(event.data);

			if (!authenticated) {
				// First message after open must be the auth response.
				try {
					const parsed = JSON.parse(raw);
					const authResult = WebSocketAuthResponseSchema.safeParse(parsed);
					if (!authResult.success) {
						const err = new QueueError({
							message: `Unexpected auth response from server: ${raw}`,
							queueName,
						});
						onError?.(err);
						ws?.close(4000, 'Invalid auth response');
						return;
					}

					if (!authResult.data.success) {
						const err = new QueueError({
							message: `Authentication failed: ${authResult.data.error ?? 'Unknown error'}`,
							queueName,
						});
						onError?.(err);
						// Auth rejection is terminal — do not reconnect with the same bad credentials.
						intentionallyClosed = true;
						ws?.close(4001, 'Auth failed');
						return;
					}

					authenticated = true;
					reconnectAttempts = 0; // Reset on successful auth.
					state = 'connected';
					if (authResult.data.client_id) {
						clientId = authResult.data.client_id;
					}
					onOpen?.();
				} catch {
					const err = new QueueError({
						message: `Failed to parse auth response: ${raw}`,
						queueName,
					});
					onError?.(err);
					ws?.close(4000, 'Invalid auth response');
				}
				return;
			}

			// Normal message after authentication.
			try {
				const parsed = JSON.parse(raw);
				const msgResult = WebSocketMessageSchema.safeParse(parsed);
				if (msgResult.success && msgResult.data.messages.length > 0) {
					for (const msg of msgResult.data.messages) {
						onMessage(msg);
						if (msg.offset !== undefined) {
							lastProcessedOffset = msg.offset;
						}
					}
				}
			} catch {
				// Non-JSON frames are silently ignored; the server may send
				// ping text frames that are not JSON.
			}
		};

		ws.onclose = (event: CloseEvent) => {
			const wasConnected = state === 'connected';
			state = 'closed';
			ws = null;

			onClose?.(event.code, event.reason);

			// Only reconnect if it was not an intentional close.
			if (!intentionallyClosed && (wasConnected || authenticated)) {
				scheduleReconnect();
			} else if (!intentionallyClosed && !authenticated) {
				// Connection closed before auth succeeded — still try to reconnect
				// (could be a transient network issue).
				scheduleReconnect();
			}
		};

		ws.onerror = () => {
			// The browser/Node WebSocket fires `error` then `close`.
			// We report the error but let `onclose` handle reconnection.
			onError?.(
				new QueueError({
					message: 'WebSocket connection error',
					queueName,
				}),
			);
		};
	}

	function scheduleReconnect() {
		if (intentionallyClosed || !autoReconnect) return;
		if (reconnectAttempts >= maxReconnectAttempts) {
			onError?.(
				new QueueError({
					message: `Exceeded maximum reconnection attempts (${maxReconnectAttempts})`,
					queueName,
				}),
			);
			return;
		}

		// Exponential backoff with jitter, capped at maxReconnectDelayMs.
		const baseDelay = reconnectDelayMs * Math.pow(2, reconnectAttempts);
		const jitter = 0.5 + Math.random() * 0.5;
		const delay = Math.min(Math.floor(baseDelay * jitter), maxReconnectDelayMs);

		reconnectAttempts++;
		state = 'reconnecting';
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	}

	// Kick off the initial connection.
	connect();

	return {
		close() {
			intentionallyClosed = true;
			if (reconnectTimer !== null) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			if (ws) {
				ws.close(1000, 'Client closed');
				ws = null;
			}
			state = 'closed';
		},
		get state() {
			return state;
		},
		get clientId() {
			return clientId;
		},
		get lastOffset() {
			return lastProcessedOffset;
		},
	};
}

// ============================================================================
// Async Iterator API
// ============================================================================

/**
 * Subscribe to real-time messages from a queue via WebSocket.
 *
 * Returns an async iterator that yields messages as they arrive.
 * The connection is automatically managed (auth, reconnection, cleanup).
 *
 * @param options - Configuration for the subscription
 * @returns An async generator that yields {@link Message} objects
 * @throws {QueueError} If no API key is available
 * @throws {QueueValidationError} If the queue name is invalid
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * for await (const message of subscribeToQueue({
 *     queueName: 'order-processing',
 *     baseUrl: 'https://catalyst.agentuity.cloud',
 *     signal: controller.signal,
 * })) {
 *     console.log('Received:', message.id, message.payload);
 * }
 * ```
 */
export async function* subscribeToQueue(
	options: SubscribeToQueueOptions,
): AsyncGenerator<Message, void, unknown> {
	const { signal } = options;

	// Check if already aborted.
	if (signal?.aborted) return;

	// A queue for buffering messages between the WebSocket callbacks and the
	// async iterator consumer.
	const buffer: Message[] = [];
	let resolve: (() => void) | null = null;
	let done = false;
	let lastError: Error | null = null;

	function push(message: Message) {
		buffer.push(message);
		if (resolve) {
			resolve();
			resolve = null;
		}
	}

	function finish(error?: Error) {
		done = true;
		if (error) lastError = error;
		if (resolve) {
			resolve();
			resolve = null;
		}
	}

	const connection = createQueueWebSocket({
		queueName: options.queueName,
		apiKey: options.apiKey,
		baseUrl: options.baseUrl,
		onMessage: push,
		onError: (err) => finish(err),
		onClose: () => {
			// Only finish if the connection is intentionally closed (signal aborted).
			// Otherwise, the callback-based API handles reconnection.
		},
		autoReconnect: true,
	});

	// Wire up the abort signal to close the connection.
	const onAbort = () => {
		connection.close();
		finish();
	};
	signal?.addEventListener('abort', onAbort, { once: true });

	try {
		while (!done) {
			// Drain buffered messages.
			while (buffer.length > 0) {
				yield buffer.shift()!;
				// Re-check after yield in case signal was aborted.
				if (done || signal?.aborted) return;
			}

			if (done || signal?.aborted) return;

			// Wait for the next message or completion.
			await new Promise<void>((r) => {
				resolve = r;
			});
		}

		// Drain any remaining messages.
		while (buffer.length > 0) {
			yield buffer.shift()!;
		}

		if (lastError) {
			throw lastError;
		}
	} finally {
		signal?.removeEventListener('abort', onAbort);
		connection.close();
	}
}
