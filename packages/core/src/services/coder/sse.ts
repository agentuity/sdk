/**
 * Server-Sent Events (SSE) client for observing Coder Hub sessions.
 *
 * SSE provides a unidirectional stream of events from the server, ideal for
 * observers who want to watch session activity without sending commands.
 *
 * @module coder/sse
 *
 * @example Class-based API with callbacks
 * ```typescript
 * import { CoderSSEClient } from '@agentuity/core/coder';
 *
 * const client = new CoderSSEClient({
 *   apiKey: 'your-api-key',
 *   sessionId: 'session-123',
 *   onSnapshot: (data) => {
 *     console.log('Session state:', data);
 *   },
 *   onBroadcast: (data) => {
 *     console.log('Broadcast event:', data.event, data.data);
 *   },
 *   onPresence: (data) => {
 *     console.log('Participant:', data.event, data.participant);
 *   },
 *   onError: (err) => {
 *     console.error('SSE error:', err);
 *   },
 * });
 *
 * client.connect();
 *
 * // Later: close the connection
 * client.close();
 * ```
 *
 * @example Async iterator API
 * ```typescript
 * import { streamCoderSessionSSE } from '@agentuity/core/coder';
 *
 * const controller = new AbortController();
 *
 * for await (const event of streamCoderSessionSSE({
 *   sessionId: 'session-123',
 *   signal: controller.signal,
 * })) {
 *   console.log('Event:', event.event, event.data);
 *
 *   if (event.data.type === 'broadcast' && event.data.event === 'session_complete') {
 *     controller.abort(); // Stop the stream
 *   }
 * }
 * ```
 */

import { z } from 'zod/v4';
import { StructuredError } from '../../error.ts';
import type { Logger } from '../../logger.ts';
import { APIClient } from '../api.ts';
import { getServiceUrls } from '../config.ts';
import { createMinimalLogger } from '../logger.ts';
import { getEnv } from '../env.ts';
import { discoverUrl } from './discover.ts';
import type {
	BroadcastEventMessage,
	ObserverSseMessage,
	PresenceEventMessage,
	SseHydrationMessage,
	SseSessionSnapshotMessage,
} from './protocol.ts';
import { ObserverSseMessageSchema } from './protocol.ts';
import { normalizeCoderUrl } from './util.ts';

/**
 * Options for the SSE client (both class-based and async iterator APIs).
 */
export const CoderSSEOptionsSchema = z.object({
	/** API key for authentication. Falls back to AGENTUITY_SDK_KEY or AGENTUITY_CLI_KEY env vars. */
	apiKey: z.string().optional().describe('API key for authentication'),
	/** Organization ID for multi-tenant operations */
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	/** Session ID to observe (required) */
	sessionId: z.string().describe('Session ID to observe'),
	/** Base URL for the Coder Hub. Falls back to AGENTUITY_CODER_URL env var. */
	url: z.string().optional().describe('Base URL for the Coder Hub'),
	/** Region used for Catalyst URL resolution when no explicit URL is provided */
	region: z.string().optional().describe('Region used for Catalyst URL resolution'),
	/** Event filters to subscribe to. Empty subscribes to default observer events. */
	subscribe: z.array(z.string()).optional().describe('Event filters to subscribe to'),
	/** Custom logger implementation */
	logger: z.custom<Logger>().optional().describe('Custom logger implementation'),
	/** Enable automatic reconnection on disconnect (default: true) */
	reconnect: z.boolean().optional().describe('Enable automatic reconnection'),
	/** Maximum reconnection attempts before giving up (default: 10) */
	maxReconnectAttempts: z.number().optional().describe('Maximum reconnection attempts'),
	/** Initial reconnection delay in milliseconds (default: 1000) */
	reconnectDelayMs: z.number().optional().describe('Initial reconnection delay'),
	/** Maximum reconnection delay in milliseconds (default: 30000) */
	maxReconnectDelayMs: z.number().optional().describe('Maximum reconnection delay'),
	/** AbortSignal to stop the subscription (async iterator only) */
	signal: z.custom<AbortSignal>().optional().describe('AbortSignal to stop the subscription'),
});
export type CoderSSEOptions = z.infer<typeof CoderSSEOptionsSchema>;

/**
 * Options for the class-based SSE client.
 *
 * Extends the base options with callbacks for each event type.
 */
export const CoderSSEClientOptionsSchema = CoderSSEOptionsSchema.extend({
	/** Called when the initial session snapshot is received */
	onSnapshot: z
		.custom<(data: SseSessionSnapshotMessage) => void>()
		.optional()
		.describe('Callback for snapshot events'),
	/** Called when hydration data (conversation history) is received */
	onHydration: z
		.custom<(data: SseHydrationMessage) => void>()
		.optional()
		.describe('Callback for hydration events'),
	/** Called when presence events (join/leave) occur */
	onPresence: z
		.custom<(data: PresenceEventMessage) => void>()
		.optional()
		.describe('Callback for presence events'),
	/** Called for broadcast events (session activity updates) */
	onBroadcast: z
		.custom<(data: BroadcastEventMessage) => void>()
		.optional()
		.describe('Callback for broadcast events'),
	/** Called for any SSE event (catch-all) */
	onEvent: z
		.custom<(event: CoderSSEEvent) => void>()
		.optional()
		.describe('Callback for all events'),
	/** Called when connection is established */
	onOpen: z.custom<() => void>().optional().describe('Callback when connection opens'),
	/** Called when connection closes */
	onClose: z.custom<() => void>().optional().describe('Callback when connection closes'),
	/** Called on errors */
	onError: z.custom<(error: Error) => void>().optional().describe('Callback on error'),
});
export type CoderSSEClientOptions = z.infer<typeof CoderSSEClientOptionsSchema>;

/**
 * Error type for SSE operations.
 *
 * @example
 * ```typescript
 * try {
 *   for await (const event of streamCoderSessionSSE({ sessionId: 'invalid' })) {
 *     // ...
 *   }
 * } catch (err) {
 *   if (err instanceof CoderSSEError) {
 *     console.log('SSE error code:', err.code);
 *   }
 * }
 * ```
 */
export const CoderSSEError = StructuredError('CoderSSEError')<{
	code: 'connection_failed' | 'auth_failed' | 'max_reconnects_exceeded' | 'parse_error';
	sessionId?: string;
}>();

/**
 * A single SSE event with its event name and parsed data.
 */
export interface CoderSSEEvent {
	/** The SSE event name (e.g., 'snapshot', 'message_update', 'session_join') */
	event: string;
	/** The parsed event data */
	data: ObserverSseMessage;
}

/**
 * Connection state for the SSE client.
 */
export type CoderSSEState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

async function buildSSEUrl(
	sessionId: string,
	options: {
		url?: string;
		apiKey?: string;
		orgId?: string;
		subscribe?: string[];
		region?: string;
		logger?: Logger;
	}
): Promise<string> {
	let baseUrl = options.url;
	if (!baseUrl) {
		const envUrl = getEnv('AGENTUITY_CODER_URL');
		if (envUrl) {
			baseUrl = normalizeCoderUrl(envUrl);
		} else {
			const region = options.region ?? getEnv('AGENTUITY_REGION') ?? 'usc';
			const catalystUrl = getServiceUrls(region).catalyst;
			const headers: Record<string, string> = {};
			if (options.orgId) {
				headers['x-agentuity-orgid'] = options.orgId;
			}
			const logger = options.logger ?? createMinimalLogger();
			const catalystClient = new APIClient(catalystUrl, logger, options.apiKey ?? '', {
				headers,
			});
			try {
				baseUrl = await discoverUrl(catalystClient);
			} catch (err) {
				throw new CoderSSEError({
					message: `Failed to discover Coder URL: ${err instanceof Error ? err.message : String(err)}`,
					code: 'connection_failed',
					sessionId,
				});
			}
		}
	}

	baseUrl = baseUrl.replace(/\/$/, '');
	const path = `/api/hub/session/${encodeURIComponent(sessionId)}/events`;

	const params = new URLSearchParams();
	if (options.subscribe && options.subscribe.length > 0) {
		params.set('subscribe', options.subscribe.join(','));
	}
	if (options.apiKey) {
		params.set('api_key', options.apiKey);
	}
	if (options.orgId) {
		params.set('org_id', options.orgId);
	}

	const queryString = params.toString();
	return queryString ? `${baseUrl}${path}?${queryString}` : `${baseUrl}${path}`;
}

interface ParsedSSEFrame {
	event: string;
	data: string;
}

const TYPED_TRANSPORT_EVENTS = new Set(['snapshot', 'hydration', 'presence', 'broadcast']);

function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}

function parseSSEFrame(block: string): ParsedSSEFrame | null {
	let event = 'message';
	const dataLines: string[] = [];

	for (const line of block.split('\n')) {
		if (!line || line.startsWith(':')) continue;

		const separatorIndex = line.indexOf(':');
		const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
		let value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
		if (value.startsWith(' ')) {
			value = value.slice(1);
		}

		if (field === 'event') {
			event = value || 'message';
		} else if (field === 'data') {
			dataLines.push(value);
		}
	}

	if (dataLines.length === 0) {
		return null;
	}

	return {
		event,
		data: dataLines.join('\n'),
	};
}

function consumeSSEBuffer(rawBuffer: string, onFrame: (frame: ParsedSSEFrame) => void): string {
	const normalized = rawBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	let cursor = 0;

	while (true) {
		const boundary = normalized.indexOf('\n\n', cursor);
		if (boundary === -1) break;

		const block = normalized.slice(cursor, boundary);
		cursor = boundary + 2;
		if (!block.trim()) continue;

		const frame = parseSSEFrame(block);
		if (frame) {
			onFrame(frame);
		}
	}

	return normalized.slice(cursor);
}

function decodeCoderSSEEvent(frame: ParsedSSEFrame, sessionId: string): CoderSSEEvent {
	let parsed: unknown;
	try {
		parsed = JSON.parse(frame.data);
	} catch (err) {
		throw new CoderSSEError({
			message: `Failed to parse SSE ${frame.event} event: ${err instanceof Error ? err.message : String(err)}`,
			code: 'parse_error',
			sessionId,
		});
	}

	const payload =
		TYPED_TRANSPORT_EVENTS.has(frame.event) && parsed && typeof parsed === 'object'
			? { type: frame.event, ...(parsed as Record<string, unknown>) }
			: parsed;
	const result = ObserverSseMessageSchema.safeParse(payload);

	if (!result.success) {
		throw new CoderSSEError({
			message: `Invalid SSE ${frame.event} event format`,
			code: 'parse_error',
			sessionId,
		});
	}

	const event = frame.event === 'message' ? result.data.type : frame.event;
	return { event, data: result.data };
}

async function readSSEStream(
	response: Response,
	signal: AbortSignal,
	onEvent: (event: CoderSSEEvent) => void,
	sessionId: string
): Promise<void> {
	if (!response.body) {
		throw new CoderSSEError({
			message: 'SSE response did not include a readable body',
			code: 'connection_failed',
			sessionId,
		});
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (!signal.aborted) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			buffer = consumeSSEBuffer(buffer, (frame) => {
				onEvent(decodeCoderSSEEvent(frame, sessionId));
			});
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// Some runtimes throw if the reader is already released after abort.
		}
	}
}

function buildConnectionError(response: Response, sessionId: string): Error {
	return new CoderSSEError({
		message: `SSE connection failed: ${response.status} ${response.statusText || 'HTTP error'}`,
		code:
			response.status === 401 || response.status === 403 ? 'auth_failed' : 'connection_failed',
		sessionId,
	});
}

/**
 * Class-based SSE client for observing Coder Hub sessions.
 *
 * Provides callback-based event handling for session observation via Server-Sent Events.
 * Automatically reconnects on disconnection with exponential backoff.
 *
 * @example
 * ```typescript
 * const client = new CoderSSEClient({
 *   apiKey: 'your-api-key',
 *   sessionId: 'session-123',
 *   onSnapshot: (data) => console.log('Snapshot:', data),
 *   onBroadcast: (data) => console.log('Broadcast:', data),
 *   onPresence: (data) => console.log('Presence:', data),
 * });
 *
 * client.connect();
 *
 * // Check connection state
 * console.log('State:', client.state);
 * console.log('Connected:', client.isConnected);
 *
 * // Close when done
 * client.close();
 * ```
 */
export class CoderSSEClient {
	readonly #options: {
		sessionId: string;
		url: string | undefined;
		region: string;
		apiKey: string;
		orgId: string;
		subscribe: string[] | undefined;
		logger: Logger;
		reconnect: boolean;
		maxReconnectAttempts: number;
		reconnectDelayMs: number;
		maxReconnectDelayMs: number;
		onSnapshot?: (data: SseSessionSnapshotMessage) => void;
		onHydration?: (data: SseHydrationMessage) => void;
		onPresence?: (data: PresenceEventMessage) => void;
		onBroadcast?: (data: BroadcastEventMessage) => void;
		onEvent?: (event: CoderSSEEvent) => void;
		onOpen?: () => void;
		onClose?: () => void;
		onError?: (error: Error) => void;
	};
	#state: CoderSSEState = 'closed';
	#abortController: AbortController | null = null;
	#reconnectAttempts = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#intentionallyClosed = false;

	constructor(options: CoderSSEClientOptions) {
		this.#options = {
			sessionId: options.sessionId,
			url: options.url,
			region: options.region ?? getEnv('AGENTUITY_REGION') ?? 'usc',
			apiKey: options.apiKey ?? getEnv('AGENTUITY_SDK_KEY') ?? getEnv('AGENTUITY_CLI_KEY') ?? '',
			orgId: options.orgId ?? '',
			subscribe: options.subscribe,
			logger: options.logger ?? createMinimalLogger(),
			reconnect: options.reconnect ?? true,
			maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
			reconnectDelayMs: options.reconnectDelayMs ?? 1000,
			maxReconnectDelayMs: options.maxReconnectDelayMs ?? 30000,
			onSnapshot: options.onSnapshot,
			onHydration: options.onHydration,
			onPresence: options.onPresence,
			onBroadcast: options.onBroadcast,
			onEvent: options.onEvent,
			onOpen: options.onOpen,
			onClose: options.onClose,
			onError: options.onError,
		};
	}

	/**
	 * The current connection state.
	 *
	 * - `'connecting'` - Initial connection in progress
	 * - `'connected'` - Connected and receiving events
	 * - `'reconnecting'` - Reconnecting after disconnect
	 * - `'closed'` - Connection closed (manually or after max retries)
	 */
	get state(): CoderSSEState {
		return this.#state;
	}

	/**
	 * Whether the client is currently connected and receiving events.
	 */
	get isConnected(): boolean {
		return this.#state === 'connected' && this.#abortController !== null;
	}

	/**
	 * Establish the SSE connection and start receiving events.
	 *
	 * If already connected or connecting, this is a no-op.
	 * Automatically reconnects on disconnection unless `close()` was called.
	 */
	connect(): void {
		if (this.#state !== 'closed') {
			return;
		}
		this.#intentionallyClosed = false;
		this.#reconnectAttempts = 0;
		if (this.#reconnectTimer !== null) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}
		this.#connectInternal();
	}

	/**
	 * Close the SSE connection and stop receiving events.
	 *
	 * After calling `close()`, you can call `connect()` again to reconnect.
	 */
	close(): void {
		this.#intentionallyClosed = true;
		if (this.#reconnectTimer !== null) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}
		if (this.#abortController) {
			this.#abortController.abort();
			this.#abortController = null;
		}
		this.#state = 'closed';
		this.#options.onClose?.();
	}

	#setState(state: CoderSSEState): void {
		this.#state = state;
	}

	#dispatchEvent(event: CoderSSEEvent): void {
		this.#options.onEvent?.(event);

		if (event.data.type === 'snapshot') {
			this.#options.onSnapshot?.(event.data);
		} else if (event.data.type === 'hydration') {
			this.#options.onHydration?.(event.data);
		} else if (event.data.type === 'presence') {
			this.#options.onPresence?.(event.data);
		} else if (event.data.type === 'broadcast') {
			this.#options.onBroadcast?.(event.data);
		}
	}

	async #connectInternal(): Promise<void> {
		if (this.#intentionallyClosed) {
			return;
		}

		this.#setState(this.#reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

		let url: string;
		try {
			url = await buildSSEUrl(this.#options.sessionId, this.#options);
		} catch (err) {
			this.#setState('closed');
			this.#options.onError?.(err as Error);
			return;
		}

		if (this.#intentionallyClosed || this.#state === 'closed') {
			return;
		}

		const controller = new AbortController();
		this.#abortController = controller;

		let response: Response;
		try {
			response = await fetch(url, {
				headers: {
					accept: 'text/event-stream',
				},
				signal: controller.signal,
			});
		} catch (err) {
			this.#abortController = null;
			if (this.#intentionallyClosed || isAbortError(err)) {
				this.#setState('closed');
				return;
			}
			this.#setState('closed');
			this.#options.onError?.(
				new CoderSSEError({
					message: `Failed to connect SSE stream: ${err instanceof Error ? err.message : String(err)}`,
					code: 'connection_failed',
					sessionId: this.#options.sessionId,
				})
			);
			this.#scheduleReconnect();
			return;
		}

		if (!response.ok) {
			this.#abortController = null;
			this.#setState('closed');
			this.#options.onError?.(buildConnectionError(response, this.#options.sessionId));
			this.#scheduleReconnect();
			return;
		}

		try {
			this.#reconnectAttempts = 0;
			this.#setState('connected');
			this.#options.logger.debug(
				'SSE connection established for session %s',
				this.#options.sessionId
			);
			this.#options.onOpen?.();

			await readSSEStream(
				response,
				controller.signal,
				(event) => this.#dispatchEvent(event),
				this.#options.sessionId
			);
		} catch (err) {
			if (this.#intentionallyClosed || isAbortError(err)) {
				return;
			}
			this.#options.onError?.(err instanceof Error ? err : new Error(String(err)));
		} finally {
			if (this.#abortController === controller) {
				this.#abortController = null;
			}
		}

		if (!this.#intentionallyClosed) {
			this.#scheduleReconnect();
		}
	}

	#scheduleReconnect(): void {
		if (this.#intentionallyClosed || !this.#options.reconnect) {
			this.#setState('closed');
			return;
		}

		if (this.#reconnectAttempts >= this.#options.maxReconnectAttempts) {
			this.#setState('closed');
			this.#options.onError?.(
				new CoderSSEError({
					message: `Exceeded maximum reconnection attempts (${this.#options.maxReconnectAttempts})`,
					code: 'max_reconnects_exceeded',
					sessionId: this.#options.sessionId,
				})
			);
			return;
		}

		const baseDelay = this.#options.reconnectDelayMs * 2 ** this.#reconnectAttempts;
		const jitter = 0.5 + Math.random() * 0.5;
		const delay = Math.min(Math.floor(baseDelay * jitter), this.#options.maxReconnectDelayMs);

		this.#reconnectAttempts++;
		this.#setState('reconnecting');
		this.#options.logger.debug(
			'SSE connection lost, reconnecting in %dms (attempt %d)',
			delay,
			this.#reconnectAttempts
		);

		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.#connectInternal();
		}, delay);
	}
}

/**
 * Stream Coder Hub session events via Server-Sent Events (SSE).
 *
 * Returns an async iterator that yields events as they arrive from the server.
 * The connection is automatically managed (reconnection, cleanup).
 *
 * @param options - Configuration for the SSE subscription
 * @yields Events from the session as they arrive
 * @throws {CoderSSEError} If connection fails or max reconnection attempts exceeded
 *
 * @example
 * ```typescript
 * import { streamCoderSessionSSE } from '@agentuity/core/coder';
 *
 * // Basic usage
 * for await (const event of streamCoderSessionSSE({
 *   sessionId: 'session-123',
 * })) {
 *   if (event.event === 'snapshot') {
 *     console.log('Session:', event.data.label);
 *   } else if (event.event === 'broadcast') {
 *     console.log('Event:', event.data.event);
 *   }
 * }
 * ```
 *
 * @example With abort signal
 * ```typescript
 * const controller = new AbortController();
 *
 * // Stop after 60 seconds
 * setTimeout(() => controller.abort(), 60000);
 *
 * for await (const event of streamCoderSessionSSE({
 *   sessionId: 'session-123',
 *   signal: controller.signal,
 * })) {
 *   console.log(event);
 * }
 * ```
 *
 * @example With event filtering
 * ```typescript
 * for await (const event of streamCoderSessionSSE({
 *   sessionId: 'session-123',
 *   subscribe: ['task_*', 'agent_*'],  // Only task and agent events
 * })) {
 *   console.log(event);
 * }
 * ```
 */
export async function* streamCoderSessionSSE(
	options: CoderSSEOptions
): AsyncGenerator<CoderSSEEvent, void, unknown> {
	const logger = options.logger ?? createMinimalLogger();
	const signal = options.signal;
	const reconnect = options.reconnect ?? true;
	const maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
	const reconnectDelayMs = options.reconnectDelayMs ?? 1000;
	const maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;

	if (signal?.aborted) {
		return;
	}

	let activeController: AbortController | null = null;
	let reconnectAttempts = 0;
	const buffer: CoderSSEEvent[] = [];
	const MAX_BUFFER = 1000;
	let resolve: (() => void) | null = null;
	let done = false;
	let terminalError: Error | null = null;

	const wake = () => {
		if (resolve) {
			resolve();
			resolve = null;
		}
	};

	const cleanup = () => {
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	};

	const connect = async (): Promise<void> => {
		if (done || signal?.aborted) {
			return;
		}

		let url: string;
		try {
			url = await buildSSEUrl(options.sessionId, {
				...options,
				logger,
			});
		} catch (err) {
			terminalError = err as Error;
			done = true;
			wake();
			return;
		}

		if (signal?.aborted) {
			done = true;
			wake();
			return;
		}

		const controller = new AbortController();
		activeController = controller;
		const abortFromCaller = () => controller.abort();
		signal?.addEventListener('abort', abortFromCaller, { once: true });

		let response: Response;
		try {
			response = await fetch(url, {
				headers: {
					accept: 'text/event-stream',
				},
				signal: controller.signal,
			});
		} catch (err) {
			signal?.removeEventListener('abort', abortFromCaller);
			if (activeController === controller) {
				activeController = null;
			}
			if (signal?.aborted || isAbortError(err)) {
				done = true;
				wake();
				return;
			}
			terminalError =
				err instanceof CoderSSEError
					? err
					: new CoderSSEError({
							message: `Failed to connect SSE stream: ${err instanceof Error ? err.message : String(err)}`,
							code: 'connection_failed',
							sessionId: options.sessionId,
						});
			done = true;
			wake();
			return;
		}

		if (signal?.aborted) {
			signal?.removeEventListener('abort', abortFromCaller);
			cleanup();
			done = true;
			wake();
			return;
		}

		if (!response.ok) {
			signal?.removeEventListener('abort', abortFromCaller);
			if (activeController === controller) {
				activeController = null;
			}
			terminalError = buildConnectionError(response, options.sessionId);
			done = true;
			wake();
			return;
		}

		reconnectAttempts = 0;
		logger.debug('SSE connection established for session %s', options.sessionId);

		void readSSEStream(
			response,
			controller.signal,
			(event) => {
				if (buffer.length >= MAX_BUFFER) {
					buffer.shift();
					logger.debug('SSE buffer full, dropped oldest event');
				}
				buffer.push(event);
				wake();
			},
			options.sessionId
		)
			.catch((err) => {
				if (signal?.aborted || isAbortError(err)) {
					done = true;
					wake();
					return;
				}
				terminalError = err instanceof Error ? err : new Error(String(err));
				done = true;
				wake();
			})
			.finally(() => {
				signal?.removeEventListener('abort', abortFromCaller);
				if (activeController === controller) {
					activeController = null;
				}

				if (done || signal?.aborted) {
					done = true;
					wake();
					return;
				}

				if (reconnect && reconnectAttempts < maxReconnectAttempts) {
					const baseDelay = reconnectDelayMs * 2 ** reconnectAttempts;
					const jitter = 0.5 + Math.random() * 0.5;
					const delay = Math.min(Math.floor(baseDelay * jitter), maxReconnectDelayMs);

					reconnectAttempts++;
					logger.debug(
						'SSE connection lost, reconnecting in %dms (attempt %d)',
						delay,
						reconnectAttempts
					);

					setTimeout(() => {
						connect();
					}, delay);
				} else if (reconnect) {
					terminalError = new CoderSSEError({
						message: `Exceeded maximum reconnection attempts (${maxReconnectAttempts})`,
						code: 'max_reconnects_exceeded',
						sessionId: options.sessionId,
					});
					done = true;
					wake();
				} else {
					done = true;
					wake();
				}
			});
	};

	const onAbort = () => {
		done = true;
		cleanup();
		wake();
	};

	signal?.addEventListener('abort', onAbort, { once: true });

	await connect();

	try {
		while (!done) {
			while (buffer.length > 0) {
				yield buffer.shift()!;
			}

			if (done) {
				break;
			}

			await new Promise<void>((r) => {
				resolve = r;
			});
		}

		while (buffer.length > 0) {
			yield buffer.shift()!;
		}

		if (terminalError) {
			throw terminalError;
		}
	} finally {
		signal?.removeEventListener('abort', onAbort);
		cleanup();
	}
}
