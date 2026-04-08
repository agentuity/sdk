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
 *   if (event.event === 'broadcast' && event.data.event === 'session_complete') {
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
	/** The SSE event name (e.g., 'snapshot', 'broadcast', 'presence') */
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
			baseUrl = await discoverUrl(catalystClient);
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

function getSSEData(event: Event): string | null {
	const msgEvent = event as unknown as { data?: unknown };
	if (typeof msgEvent.data === 'string') {
		return msgEvent.data;
	}
	return null;
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
	#eventSource: EventSource | null = null;
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
		return this.#state === 'connected' && this.#eventSource?.readyState === 1;
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
		if (this.#eventSource) {
			this.#eventSource.close();
			this.#eventSource = null;
		}
		this.#state = 'closed';
		this.#options.onClose?.();
	}

	#setState(state: CoderSSEState): void {
		this.#state = state;
	}

	#handleEvent(eventName: string, typeOverride?: string): void {
		this.#eventSource!.addEventListener(eventName, (event: Event) => {
			const data = getSSEData(event);
			if (!data) return;

			try {
				const parsed = JSON.parse(data);
				const payload = typeOverride ? { type: typeOverride, ...parsed } : parsed;
				const result = ObserverSseMessageSchema.safeParse(payload);

				if (result.success) {
					const sseEvent: CoderSSEEvent = { event: eventName, data: result.data };
					this.#options.onEvent?.(sseEvent);

					if (result.data.type === 'snapshot') {
						this.#options.onSnapshot?.(result.data);
					} else if (result.data.type === 'hydration') {
						this.#options.onHydration?.(result.data);
					} else if (result.data.type === 'presence') {
						this.#options.onPresence?.(result.data);
					} else if (result.data.type === 'broadcast') {
						this.#options.onBroadcast?.(result.data);
					}
				} else {
					const parseError = new CoderSSEError({
						message: `Invalid SSE ${eventName} event format`,
						code: 'parse_error',
						sessionId: this.#options.sessionId,
					});
					this.#options.onError?.(parseError);
				}
			} catch (err) {
				const parseError = new CoderSSEError({
					message: `Failed to parse SSE ${eventName} event: ${err instanceof Error ? err.message : String(err)}`,
					code: 'parse_error',
					sessionId: this.#options.sessionId,
				});
				this.#options.onError?.(parseError);
			}
		});
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

		try {
			const EventSourceCtor: typeof EventSource = EventSource;
			this.#eventSource = new (EventSourceCtor as unknown as new (url: string) => EventSource)(
				url
			);
		} catch (err) {
			this.#setState('closed');
			this.#options.onError?.(
				new CoderSSEError({
					message: `Failed to create EventSource: ${err instanceof Error ? err.message : String(err)}`,
					code: 'connection_failed',
					sessionId: this.#options.sessionId,
				})
			);
			this.#scheduleReconnect();
			return;
		}

		this.#eventSource.onerror = () => {
			if (this.#eventSource) {
				this.#eventSource.close();
				this.#eventSource = null;
			}

			if (this.#intentionallyClosed) {
				return;
			}

			this.#scheduleReconnect();
		};

		this.#eventSource.onopen = () => {
			this.#reconnectAttempts = 0;
			this.#setState('connected');
			this.#options.logger.debug(
				'SSE connection established for session %s',
				this.#options.sessionId
			);
			this.#options.onOpen?.();
		};

		this.#handleEvent('snapshot', 'snapshot');
		this.#handleEvent('hydration', 'hydration');
		this.#handleEvent('presence', 'presence');
		this.#handleEvent('broadcast', 'broadcast');
		this.#handleEvent('message');
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

	let eventSource: EventSource | null = null;
	let reconnectAttempts = 0;
	const buffer: CoderSSEEvent[] = [];
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
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	};

	const handleSSEEvent = (eventName: string, typeOverride?: string) => {
		eventSource!.addEventListener(eventName, (event: Event) => {
			const data = getSSEData(event);
			if (!data) return;
			try {
				const parsed = JSON.parse(data);
				const payload = typeOverride ? { type: typeOverride, ...parsed } : parsed;
				const result = ObserverSseMessageSchema.safeParse(payload);
				if (result.success) {
					buffer.push({ event: eventName, data: result.data });
					wake();
				} else {
					logger.debug('Invalid SSE %s event format', eventName);
				}
			} catch (err) {
				logger.debug('Failed to parse SSE %s event: %s', eventName, err);
			}
		});
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

		try {
			const EventSourceCtor: typeof EventSource = EventSource;
			eventSource = new (EventSourceCtor as unknown as new (url: string) => EventSource)(url);
		} catch (err) {
			terminalError = new CoderSSEError({
				message: `Failed to create EventSource: ${err instanceof Error ? err.message : String(err)}`,
				code: 'connection_failed',
				sessionId: options.sessionId,
			});
			done = true;
			wake();
			return;
		}

		eventSource.onerror = () => {
			cleanup();

			if (signal?.aborted) {
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
		};

		eventSource.onopen = () => {
			reconnectAttempts = 0;
			logger.debug('SSE connection established for session %s', options.sessionId);
		};

		handleSSEEvent('snapshot', 'snapshot');
		handleSSEEvent('hydration', 'hydration');
		handleSSEEvent('presence', 'presence');
		handleSSEEvent('broadcast', 'broadcast');
		handleSSEEvent('message');
	};

	await connect();

	const onAbort = () => {
		done = true;
		cleanup();
		wake();
	};

	signal?.addEventListener('abort', onAbort, { once: true });

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
