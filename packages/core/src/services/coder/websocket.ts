/**
 * WebSocket client for the Coder Hub real-time communication.
 *
 * Provides bidirectional communication between clients and the Coder Hub server,
 * supporting multiple connection roles (lead, observer, controller) with
 * automatic reconnection, heartbeat, and message queuing.
 *
 * @module coder/websocket
 *
 * @example Class-based API with callbacks
 * ```typescript
 * import { CoderHubWebSocketClient } from '@agentuity/core/coder';
 *
 * const client = new CoderHubWebSocketClient({
 *   apiKey: 'your-api-key',
 *   sessionId: 'session-123',
 *   role: 'observer',
 *   onInit: (init) => {
 *     console.log('Connected to session:', init.sessionId);
 *     console.log('Available agents:', init.agents);
 *   },
 *   onMessage: (msg) => {
 *     console.log('Received:', msg);
 *   },
 *   onStateChange: (state) => {
 *     console.log('Connection state:', state);
 *   },
 * });
 *
 * client.connect();
 *
 * // Send a message
 * client.send({
 *   type: 'ping',
 *   timestamp: Date.now(),
 * });
 *
 * // Close when done
 * client.close();
 * ```
 *
 * @example Async iterator API
 * ```typescript
 * import { subscribeToCoderHub } from '@agentuity/core/coder';
 *
 * for await (const message of subscribeToCoderHub({
 *   sessionId: 'session-123',
 *   role: 'observer',
 * })) {
 *   if (message.type === 'broadcast') {
 *     console.log('Event:', message.event, message.data);
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
import { isTerminalCloseCode } from './close-codes.ts';
import { discoverUrl } from './discover.ts';
import type {
	ClientMessage,
	CoderHubInitMessage,
	CoderHubResponse,
	ConnectionParams,
	ServerMessage,
} from './protocol.ts';
import { CoderHubInitMessageSchema, parseServerMessage } from './protocol.ts';
import { normalizeCoderUrl } from './util.ts';

/**
 * Connection state for the WebSocket client.
 *
 * - `'connecting'` - Initial WebSocket connection in progress
 * - `'authenticating'` - WebSocket connected, sending auth message
 * - `'connected'` - Authenticated and ready to send/receive messages
 * - `'reconnecting'` - Reconnecting after disconnect
 * - `'closed'` - Connection closed (manually or after max retries)
 */
export type CoderHubWebSocketState =
	| 'connecting'
	| 'authenticating'
	| 'connected'
	| 'reconnecting'
	| 'closed';

/**
 * Options for the WebSocket client.
 */
export const CoderHubWebSocketOptionsSchema = z.object({
	/** API key for authentication. Falls back to AGENTUITY_SDK_KEY or AGENTUITY_CLI_KEY env vars. */
	apiKey: z.string().optional().describe('API key for authentication'),
	/** Organization ID for multi-tenant operations */
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	/** WebSocket URL for the Coder Hub. Falls back to AGENTUITY_CODER_URL env var. */
	url: z.string().optional().describe('WebSocket URL for the Coder Hub'),
	/** Region used for Catalyst URL resolution when no explicit URL is provided */
	region: z.string().optional().describe('Region used for Catalyst URL resolution'),
	/** Session ID to connect to. For new sessions, leave empty and server will assign one. */
	sessionId: z.string().optional().describe('Session ID to connect to'),
	/**
	 * Connection role:
	 * - `'lead'` - Primary driver of the session (only one per session)
	 * - `'observer'` - Read-only observer (receive broadcasts)
	 * - `'controller'` - Bidirectional control (web UI)
	 */
	role: z.enum(['lead', 'observer', 'controller']).optional().describe('Connection role'),
	/** Agent role for sub-agent connections (e.g., 'scout', 'builder') */
	agent: z.string().optional().describe('Agent role for sub-agent connections'),
	/** Parent session ID for sub-agent connections */
	parentSessionId: z.string().optional().describe('Parent session ID for sub-agent connections'),
	/** Initial task for driver mode sessions */
	task: z.string().optional().describe('Initial task for driver mode'),
	/** Human-readable session label */
	label: z.string().optional().describe('Session label'),
	/** Observer event filters to request during the initial connection. */
	subscribe: z
		.array(z.string())
		.optional()
		.describe('Observer event filters to request during connection setup'),
	/** Client origin (web, desktop, tui, sdk) */
	origin: z.enum(['web', 'desktop', 'tui', 'sdk']).optional().describe('Client origin'),
	/** Driver mode: 'rpc' for RPC bridge driver */
	driverMode: z.enum(['rpc']).optional().describe('Driver mode'),
	/** Driver instance ID for fencing stale reconnects */
	driverInstanceId: z.string().optional().describe('Driver instance ID'),
	/** Driver version for observability */
	driverVersion: z.string().optional().describe('Driver version'),
	/** Custom logger implementation */
	logger: z.custom<Logger>().optional().describe('Custom logger implementation'),
	/** Enable automatic reconnection on disconnect (default: true) */
	autoReconnect: z.boolean().optional().describe('Enable automatic reconnection'),
	/** Maximum reconnection attempts before giving up (default: 10) */
	maxReconnectAttempts: z.number().optional().describe('Maximum reconnection attempts'),
	/** Initial reconnection delay in milliseconds (default: 1000) */
	reconnectDelayMs: z.number().optional().describe('Initial reconnection delay'),
	/** Maximum reconnection delay in milliseconds (default: 30000) */
	maxReconnectDelayMs: z.number().optional().describe('Maximum reconnection delay'),
	/** Ping interval in milliseconds (default: 10000) */
	heartbeatIntervalMs: z.number().optional().describe('Ping interval'),
	/** Time without response before forcing reconnect in milliseconds (default: 30000) */
	heartbeatTimeoutMs: z.number().optional().describe('Time without response before reconnect'),
	/** Maximum queued messages while disconnected (default: 1000) */
	maxMessageQueueSize: z
		.number()
		.optional()
		.describe('Maximum queued messages while disconnected'),
	/** Callback when connection is authenticated and ready */
	onOpen: z.custom<() => void>().optional().describe('Callback when connection opens'),
	/** Callback when connection closes */
	onClose: z
		.custom<(code: number, reason: string) => void>()
		.optional()
		.describe('Callback when connection closes'),
	/** Callback on errors */
	onError: z.custom<(error: Error) => void>().optional().describe('Callback on error'),
	/** Callback for all incoming messages */
	onMessage: z
		.custom<(message: ServerMessage) => void>()
		.optional()
		.describe('Callback for incoming messages'),
	/** Callback when init message is received (after authentication) */
	onInit: z
		.custom<(message: CoderHubInitMessage) => void>()
		.optional()
		.describe('Callback when init message received'),
	/** Callback when connection state changes */
	onStateChange: z
		.custom<(state: CoderHubWebSocketState) => void>()
		.optional()
		.describe('Callback on state change'),
});
export type CoderHubWebSocketOptions = z.infer<typeof CoderHubWebSocketOptionsSchema>;

/**
 * Error type for WebSocket operations.
 *
 * @example
 * ```typescript
 * try {
 *   await client.sendAndWait({ type: 'tool', name: 'read', ... });
 * } catch (err) {
 *   if (err instanceof CoderHubWebSocketError) {
 *     if (err.code === 'response_timeout') {
 *       console.log('Server did not respond in time');
 *     }
 *   }
 * }
 * ```
 */
export const CoderHubWebSocketError = StructuredError('CoderHubWebSocketError')<{
	code:
		| 'connection_failed'
		| 'auth_failed'
		| 'connection_error'
		| 'max_reconnects_exceeded'
		| 'send_while_disconnected'
		| 'response_timeout'
		| 'invalid_response';
	sessionId?: string;
	serverCode?: string;
	serverMessage?: string;
	serverMessageType?: 'connection_rejected' | 'protocol_error';
	closeCode?: number;
	closeReason?: string;
}>();
export type CoderHubWebSocketErrorInstance = InstanceType<typeof CoderHubWebSocketError>;

interface PendingRequest {
	resolve: (response: CoderHubResponse) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/**
 * WebSocket client for real-time Coder Hub communication.
 *
 * Supports multiple connection roles and provides automatic reconnection,
 * heartbeat management, and message queuing for resilient connections.
 *
 * @example Observer connection
 * ```typescript
 * const client = new CoderHubWebSocketClient({
 *   sessionId: 'session-123',
 *   role: 'observer',
 *   onMessage: (msg) => {
 *     if (msg.type === 'broadcast') {
 *       console.log('Event:', msg.event);
 *     }
 *   },
 * });
 * client.connect();
 * ```
 *
 * @example Controller connection with sendAndWait
 * ```typescript
 * const client = new CoderHubWebSocketClient({
 *   sessionId: 'session-123',
 *   role: 'controller',
 * });
 * client.connect();
 *
 * // Wait for connection
 * await new Promise(resolve => {
 *   client.onInit = () => resolve(undefined);
 * });
 *
 * // Send a request and wait for response
 * const response = await client.sendAndWait({
 *   type: 'event',
 *   event: 'steer',
 *   data: { direction: 'continue' },
 * });
 * console.log('Response:', response);
 * ```
 *
 * @example Sub-agent connection
 * ```typescript
 * const client = new CoderHubWebSocketClient({
 *   role: 'observer', // Sub-agents connect as observers to parent
 *   agent: 'scout',
 *   parentSessionId: 'parent-session-456',
 * });
 * client.connect();
 * ```
 */
export class CoderHubWebSocketClient {
	readonly #options: {
		apiKey: string;
		orgId: string;
		url: string;
		region: string;
		sessionId: string;
		role: 'lead' | 'observer' | 'controller';
		agent: string;
		parentSessionId: string;
		task: string;
		label: string;
		subscribe: string[];
		origin: 'web' | 'desktop' | 'tui' | 'sdk';
		driverMode: 'rpc' | undefined;
		driverInstanceId: string;
		driverVersion: string;
		logger: Logger;
		autoReconnect: boolean;
		maxReconnectAttempts: number;
		reconnectDelayMs: number;
		maxReconnectDelayMs: number;
		heartbeatIntervalMs: number;
		heartbeatTimeoutMs: number;
		maxMessageQueueSize: number;
		onOpen: () => void;
		onClose: (code: number, reason: string) => void;
		onError: (error: Error) => void;
		onMessage: (message: ServerMessage) => void;
		onInit: (message: CoderHubInitMessage) => void;
		onStateChange: (state: CoderHubWebSocketState) => void;
	};
	#state: CoderHubWebSocketState = 'closed';
	#ws: WebSocket | null = null;
	#reconnectAttempts = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#intentionallyClosed = false;
	#authenticated = false;
	#initMessage: CoderHubInitMessage | null = null;
	#heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
	#lastInboundTimestamp = 0;
	#messageQueue: ClientMessage[] = [];
	#pendingRequests: Map<string, PendingRequest> = new Map();
	#messageId = 0;
	#sessionId: string | null = null;

	constructor(options: CoderHubWebSocketOptions = {}) {
		const apiKey =
			options.apiKey ?? getEnv('AGENTUITY_SDK_KEY') ?? getEnv('AGENTUITY_CLI_KEY') ?? '';
		this.#options = {
			apiKey,
			orgId: options.orgId ?? '',
			url: options.url ?? '',
			region: options.region ?? getEnv('AGENTUITY_REGION') ?? 'usc',
			sessionId: options.sessionId ?? '',
			role: options.role ?? 'observer',
			agent: options.agent ?? '',
			parentSessionId: options.parentSessionId ?? '',
			task: options.task ?? '',
			label: options.label ?? '',
			subscribe: options.subscribe ?? [],
			origin: options.origin ?? 'sdk',
			driverMode: options.driverMode,
			driverInstanceId: options.driverInstanceId ?? '',
			driverVersion: options.driverVersion ?? '',
			logger: options.logger ?? createMinimalLogger(),
			autoReconnect: options.autoReconnect ?? true,
			maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
			reconnectDelayMs: options.reconnectDelayMs ?? 1000,
			maxReconnectDelayMs: options.maxReconnectDelayMs ?? 30000,
			heartbeatIntervalMs: options.heartbeatIntervalMs ?? 10000,
			heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? 30000,
			maxMessageQueueSize: options.maxMessageQueueSize ?? 1000,
			onOpen: options.onOpen ?? (() => {}),
			onClose: options.onClose ?? (() => {}),
			onError: options.onError ?? (() => {}),
			onMessage: options.onMessage ?? (() => {}),
			onInit: options.onInit ?? (() => {}),
			onStateChange: options.onStateChange ?? (() => {}),
		};
	}

	/**
	 * The current connection state.
	 *
	 * @see CoderHubWebSocketState for state descriptions
	 */
	get state(): CoderHubWebSocketState {
		return this.#state;
	}

	/**
	 * The session ID for this connection.
	 *
	 * Returns the server-assigned session ID (from init message) if available,
	 * otherwise returns the session ID passed in options.
	 */
	get sessionId(): string | undefined {
		return this.#sessionId ?? this.#options.sessionId ?? undefined;
	}

	/**
	 * The init message received from the server after authentication.
	 *
	 * Contains session configuration, available agents, tools, and other metadata.
	 * Only available after successful authentication.
	 */
	get initMessage(): CoderHubInitMessage | null {
		return this.#initMessage;
	}

	/**
	 * Whether the client is currently connected and authenticated.
	 *
	 * Returns `true` only when state is 'connected' AND WebSocket is open.
	 */
	get isConnected(): boolean {
		return this.#state === 'connected' && this.#ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Establish the WebSocket connection and authenticate.
	 *
	 * If already connected or connecting, this is a no-op.
	 * Automatically reconnects on disconnection unless `close()` was called.
	 *
	 * The connection goes through these states:
	 * 1. `'connecting'` - WebSocket opening
	 * 2. `'authenticating'` - Sending auth message
	 * 3. `'connected'` - Received init message
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
	 * Close the WebSocket connection.
	 *
	 * After calling `close()`, you can call `connect()` again to reconnect.
	 * Any pending requests will be rejected with an error.
	 *
	 * @param code - Optional close code (default: 1000 for normal close)
	 * @param reason - Optional close reason string
	 */
	close(code?: number, reason?: string): void {
		this.#intentionallyClosed = true;
		this.#clearTimers();
		if (this.#ws) {
			const ws = this.#ws;
			ws.onopen = null;
			ws.onmessage = null;
			ws.onerror = null;
			ws.onclose = null;
			ws.close(code ?? 1000, reason ?? 'Client closed');
			this.#ws = null;
		}
		this.#setState('closed');
		this.#rejectAllPendingRequests('Connection closed');
	}

	/**
	 * Send a message to the server.
	 *
	 * If not connected, the message will be queued and sent when reconnected
	 * (up to `maxMessageQueueSize` messages). If the queue is full, an error
	 * is emitted via `onError`.
	 *
	 * @param message - The message to send
	 *
	 * @example
	 * ```typescript
	 * client.send({
	 *   type: 'ping',
	 *   timestamp: Date.now(),
	 * });
	 *
	 * client.send({
	 *   type: 'session_entry',
	 *   path: 'entries.jsonl',
	 *   line: JSON.stringify({ type: 'message', content: 'Hello' }),
	 * });
	 * ```
	 */
	send(message: ClientMessage): void {
		if (!this.isConnected) {
			if (this.#messageQueue.length < this.#options.maxMessageQueueSize) {
				this.#messageQueue.push(message);
			} else {
				this.#options.onError(
					new CoderHubWebSocketError({
						message: 'Message queue full, dropping message',
						code: 'send_while_disconnected',
						sessionId: this.sessionId,
					})
				);
			}
			return;
		}
		this.#ws!.send(JSON.stringify(message));
	}

	/**
	 * Send a message and wait for a response.
	 *
	 * Automatically adds a unique `id` to the message and waits for a
	 * response with matching `id`. Useful for request/response patterns
	 * like tool calls or RPC commands.
	 *
	 * @param message - The message to send (without `id` field)
	 * @param timeoutMs - Timeout in milliseconds (default: 30000)
	 * @returns Promise that resolves with the response
	 * @throws {CoderHubWebSocketError} If timeout exceeded or connection closed
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   const response = await client.sendAndWait({
	 *     type: 'tool',
	 *     name: 'read_file',
	 *     toolCallId: 'call-123',
	 *     params: { path: '/src/index.ts' },
	 *   });
	 *   console.log('Tool result:', response.actions);
	 * } catch (err) {
	 *   if (err instanceof CoderHubWebSocketError && err.code === 'response_timeout') {
	 *     console.log('Tool call timed out');
	 *   }
	 * }
	 * ```
	 */
	async sendAndWait(
		message: Omit<ClientMessage, 'id'>,
		timeoutMs = 30000
	): Promise<CoderHubResponse> {
		const id = this.#nextId();
		const fullMessage = { ...message, id } as ClientMessage;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.#pendingRequests.delete(id);
				reject(
					new CoderHubWebSocketError({
						message: `Response timeout for request ${id}`,
						code: 'response_timeout',
						sessionId: this.sessionId,
					})
				);
			}, timeoutMs);

			this.#pendingRequests.set(id, { resolve, reject, timeout });
			this.send(fullMessage);
		});
	}

	#nextId(): string {
		return `${Date.now()}-${++this.#messageId}`;
	}

	#buildHandshakeError(input: {
		code: 'auth_failed' | 'connection_error';
		message: string;
		serverCode?: string;
		serverMessage?: string;
		serverMessageType?: 'connection_rejected' | 'protocol_error';
		closeCode?: number;
		closeReason?: string;
	}): CoderHubWebSocketErrorInstance {
		return new CoderHubWebSocketError({
			code: input.code,
			message: input.message,
			sessionId: this.sessionId,
			serverCode: input.serverCode,
			serverMessage: input.serverMessage,
			serverMessageType: input.serverMessageType,
			closeCode: input.closeCode,
			closeReason: input.closeReason,
		});
	}

	#markReady(input?: {
		initMessage?: CoderHubInitMessage;
		firstMessage?: ServerMessage;
		sendBootstrapReady?: boolean;
	}): void {
		this.#authenticated = true;
		this.#initMessage = input?.initMessage ?? null;
		this.#sessionId =
			input?.initMessage?.sessionId ??
			(input?.firstMessage && 'sessionId' in input.firstMessage
				? input.firstMessage.sessionId
				: undefined) ??
			this.#options.sessionId ??
			null;
		this.#reconnectAttempts = 0;
		this.#setState('connected');
		this.#startHeartbeat();
		if (input?.initMessage) {
			this.#options.onInit(input.initMessage);
		}
		if (input?.sendBootstrapReady && this.#ws?.readyState === WebSocket.OPEN) {
			this.#ws.send(JSON.stringify({ type: 'bootstrap_ready' }));
		}
		this.#flushMessageQueue();
		this.#options.onOpen();
		if (input?.firstMessage) {
			this.#options.onMessage(input.firstMessage);
		}
	}

	#setState(state: CoderHubWebSocketState): void {
		if (this.#state !== state) {
			this.#state = state;
			this.#options.onStateChange(state);
		}
	}

	#clearTimers(): void {
		if (this.#reconnectTimer !== null) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}
		if (this.#heartbeatTimer !== null) {
			clearTimeout(this.#heartbeatTimer);
			this.#heartbeatTimer = null;
		}
	}

	#rejectAllPendingRequests(reason: string): void {
		for (const [, pending] of this.#pendingRequests) {
			clearTimeout(pending.timeout);
			pending.reject(
				new CoderHubWebSocketError({
					message: reason,
					code: 'connection_error',
					sessionId: this.sessionId,
				})
			);
		}
		this.#pendingRequests.clear();
	}

	async #buildWsUrl(): Promise<string> {
		let baseUrl = this.#options.url;
		if (!baseUrl) {
			const envUrl = getEnv('AGENTUITY_CODER_URL');
			if (envUrl) {
				baseUrl = normalizeCoderUrl(envUrl);
			} else {
				const catalystUrl = getServiceUrls(this.#options.region).catalyst;
				const headers: Record<string, string> = {};
				if (this.#options.orgId) {
					headers['x-agentuity-orgid'] = this.#options.orgId;
				}
				const catalystClient = new APIClient(
					catalystUrl,
					this.#options.logger,
					this.#options.apiKey,
					{ headers }
				);
				baseUrl = await discoverUrl(catalystClient);
			}
		}

		let wsUrl = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
		wsUrl = wsUrl.replace(/\/$/, '');
		const path = wsUrl.includes('/api/ws') ? '' : '/api/ws';
		wsUrl = `${wsUrl}${path}`;

		const params = new URLSearchParams();
		const connectionParams: ConnectionParams = {
			sessionId: this.#sessionId ?? (this.#options.sessionId || undefined),
			role: this.#options.role || undefined,
			agent: this.#options.agent || undefined,
			parent: this.#options.parentSessionId || undefined,
			task: this.#options.task || undefined,
			label: this.#options.label || undefined,
			subscribe:
				this.#options.subscribe.length > 0 ? this.#options.subscribe.join(',') : undefined,
			orgId: this.#options.orgId || undefined,
			origin: this.#options.origin || undefined,
			driverMode: this.#options.driverMode || undefined,
			driverInstanceId: this.#options.driverInstanceId || undefined,
			driverVersion: this.#options.driverVersion || undefined,
		};

		for (const [key, value] of Object.entries(connectionParams)) {
			if (value !== undefined && value !== '') {
				params.set(key, String(value));
			}
		}
		if (this.#options.apiKey) {
			params.set('api_key', this.#options.apiKey);
		}

		const queryString = params.toString();
		return queryString ? `${wsUrl}?${queryString}` : wsUrl;
	}

	async #connectInternal(): Promise<void> {
		if (this.#intentionallyClosed) {
			return;
		}

		this.#setState(this.#reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

		let wsUrl: string;
		try {
			wsUrl = await this.#buildWsUrl();
		} catch (err) {
			this.#setState('closed');
			this.#options.onError(err as Error);
			return;
		}

		try {
			this.#ws = new WebSocket(wsUrl);
		} catch (err) {
			this.#setState('closed');
			this.#options.onError(
				new CoderHubWebSocketError({
					message: `Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`,
					code: 'connection_failed',
					sessionId: this.sessionId,
				})
			);
			this.#scheduleReconnect();
			return;
		}

		const ws = this.#ws;

		ws.onopen = () => {
			if (ws !== this.#ws) return;
			this.#setState('authenticating');
			if (this.#options.apiKey || this.#options.orgId) {
				ws.send(
					JSON.stringify({
						authorization: this.#options.apiKey,
						org_id: this.#options.orgId,
					})
				);
			}
		};

		ws.onmessage = (event: MessageEvent) => {
			if (ws !== this.#ws) return;
			this.#lastInboundTimestamp = Date.now();
			const raw = typeof event.data === 'string' ? event.data : String(event.data);

			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				this.#options.logger.debug('Failed to parse WebSocket message: %s', raw);
				return;
			}

			if (!this.#authenticated) {
				if (parsed && typeof parsed === 'object') {
					const data = parsed as Record<string, unknown>;
					if (data.error) {
						this.#setState('closed');
						this.#options.onError(
							new CoderHubWebSocketError({
								message: `Authentication failed: ${String(data.error)}`,
								code: 'auth_failed',
								sessionId: this.sessionId,
							})
						);
						this.#intentionallyClosed = true;
						ws.close(4401, 'Auth failed');
						return;
					}

					// Handle protocol failure messages
					const msg = data as { type?: unknown; code?: string; message?: string };
					if (msg.type === 'connection_rejected' || msg.type === 'protocol_error') {
						this.#setState('closed');
						this.#options.onError(
							this.#buildHandshakeError({
								code: 'auth_failed',
								message: `Connection rejected: ${msg.message ?? msg.code ?? 'Unknown error'}`,
								serverCode: msg.code,
								serverMessage: msg.message,
								serverMessageType: msg.type,
							})
						);
						this.#intentionallyClosed = true;
						ws.close(4401, 'Auth failed');
						return;
					}
				}

				const initResult = CoderHubInitMessageSchema.safeParse(parsed);
				if (initResult.success) {
					const initMsg = initResult.data;
					this.#markReady({
						initMessage: initMsg,
						sendBootstrapReady: this.#options.role === 'controller',
					});
					return;
				}

				if (this.#options.role === 'observer') {
					const firstObserverMessage = parseServerMessage(parsed);
					if (firstObserverMessage) {
						this.#markReady({ firstMessage: firstObserverMessage });
					}
				}
				return;
			}

			const message = parsed as ServerMessage;
			this.#options.onMessage(message);

			if ('type' in message) {
				if (message.type === 'broadcast' || message.type === 'presence') {
					return;
				}
			}

			if ('id' in message && typeof message.id === 'string') {
				const pending = this.#pendingRequests.get(message.id);
				if (pending) {
					clearTimeout(pending.timeout);
					this.#pendingRequests.delete(message.id);
					if ('actions' in message) {
						pending.resolve(message as CoderHubResponse);
					} else {
						pending.reject(
							new CoderHubWebSocketError({
								message: `Malformed response for request ${message.id}: missing actions`,
								code: 'invalid_response',
								sessionId: this.sessionId,
							})
						);
					}
				}
			}
		};

		ws.onerror = () => {
			if (ws !== this.#ws) return;
			this.#options.onError(
				new CoderHubWebSocketError({
					message: 'WebSocket connection error',
					code: 'connection_error',
					sessionId: this.sessionId,
				})
			);
		};

		ws.onclose = (event: CloseEvent) => {
			if (ws !== this.#ws) return;
			this.#ws = null;
			this.#clearTimers();
			this.#setState('closed');

			const wasAuthenticated = this.#authenticated;
			const hadTerminalError = this.#intentionallyClosed;
			const terminalClose = isTerminalCloseCode(event.code);

			// Clear auth state for clean reconnect
			this.#authenticated = false;
			this.#initMessage = null;

			if (terminalClose) {
				this.#intentionallyClosed = true;
			}

			if (!wasAuthenticated && terminalClose && !hadTerminalError) {
				this.#options.onError(
					this.#buildHandshakeError({
						code: 'connection_error',
						message: `WebSocket closed before connection was ready (code ${event.code})${
							event.reason ? `: ${event.reason}` : ''
						}`,
						closeCode: event.code,
						closeReason: event.reason || undefined,
					})
				);
			}

			this.#options.onClose(event.code, event.reason);

			if (!this.#intentionallyClosed) {
				this.#scheduleReconnect();
			}
		};
	}

	#scheduleReconnect(): void {
		if (this.#intentionallyClosed || !this.#options.autoReconnect) {
			return;
		}

		if (this.#reconnectAttempts >= this.#options.maxReconnectAttempts) {
			this.#options.onError(
				new CoderHubWebSocketError({
					message: `Exceeded maximum reconnection attempts (${this.#options.maxReconnectAttempts})`,
					code: 'max_reconnects_exceeded',
					sessionId: this.sessionId,
				})
			);
			return;
		}

		const baseDelay = this.#options.reconnectDelayMs * 2 ** this.#reconnectAttempts;
		const jitter = 0.5 + Math.random() * 0.5;
		const delay = Math.min(Math.floor(baseDelay * jitter), this.#options.maxReconnectDelayMs);

		this.#reconnectAttempts++;
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.#connectInternal();
		}, delay);
	}

	#startHeartbeat(): void {
		this.#heartbeatTimer = setInterval(() => {
			if (!this.isConnected) {
				return;
			}

			const elapsed = Date.now() - this.#lastInboundTimestamp;
			if (elapsed > this.#options.heartbeatTimeoutMs) {
				this.#options.logger.debug('Heartbeat timeout, forcing reconnect');
				this.#ws?.close(1000, 'Heartbeat timeout');
				return;
			}

			this.send({
				type: 'ping',
				timestamp: Date.now(),
			});
		}, this.#options.heartbeatIntervalMs);
	}

	#flushMessageQueue(): void {
		while (this.#messageQueue.length > 0 && this.isConnected) {
			const message = this.#messageQueue.shift()!;
			this.#ws!.send(JSON.stringify(message));
		}
	}
}

/**
 * Subscribe to a Coder Hub session via WebSocket using async iteration.
 *
 * Returns an async iterator that yields server messages as they arrive.
 * The connection is automatically managed (auth, reconnection, cleanup).
 *
 * @param options - Configuration for the WebSocket connection
 * @yields Server messages as they arrive
 * @throws {CoderHubWebSocketError} If connection fails or max reconnection attempts exceeded
 *
 * @example Basic usage
 * ```typescript
 * import { subscribeToCoderHub } from '@agentuity/core/coder';
 *
 * for await (const message of subscribeToCoderHub({
 *   sessionId: 'session-123',
 *   role: 'observer',
 * })) {
 *   switch (message.type) {
 *     case 'broadcast':
 *       console.log('Event:', message.event);
 *       break;
 *     case 'presence':
 *       console.log('Participant:', message.participant);
 *       break;
 *   }
 * }
 * ```
 *
 * @example With error handling
 * ```typescript
 * try {
 *   for await (const message of subscribeToCoderHub({ sessionId: 'session-123' })) {
 *     console.log(message);
 *   }
 * } catch (err) {
 *   if (err instanceof CoderHubWebSocketError) {
 *     console.log('WebSocket error:', err.code);
 *   }
 * }
 * ```
 */
export async function* subscribeToCoderHub(
	options: CoderHubWebSocketOptions
): AsyncGenerator<ServerMessage, void, unknown> {
	const buffer: ServerMessage[] = [];
	let resolve: (() => void) | null = null;
	let done = false;
	let terminalError: Error | null = null;

	const wake = () => {
		if (resolve) {
			resolve();
			resolve = null;
		}
	};

	const client = new CoderHubWebSocketClient({
		...options,
		onMessage: (message) => {
			buffer.push(message);
			wake();
		},
		onError: (error) => {
			if (
				error instanceof CoderHubWebSocketError &&
				(error.code === 'max_reconnects_exceeded' ||
					error.code === 'auth_failed' ||
					(error.code === 'connection_error' &&
						typeof error.closeCode === 'number' &&
						isTerminalCloseCode(error.closeCode)))
			) {
				terminalError = error;
				done = true;
				wake();
			}
			options.onError?.(error);
		},
		onClose: (code, reason) => {
			if (isTerminalCloseCode(code) || options.autoReconnect === false) {
				done = true;
			}
			wake();
			options.onClose?.(code, reason);
		},
	});

	client.connect();

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
		client.close();
	}
}
