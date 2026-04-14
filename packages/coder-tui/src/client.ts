import type { HubClientMessage, HubRequest, HubResponse, InitMessage } from './protocol.ts';
import { applyCoderAuthHeaders } from './auth.ts';

/** How long to wait for a response before rejecting the pending promise (ms). */
const SEND_TIMEOUT_MS = 30_000;

/** How long to wait for the init message after connecting (ms). */
const CONNECT_TIMEOUT_MS = 30_000;

/** Reconnect backoff starts at 1s and doubles per attempt, capped at 30s. */
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;
const RECONNECT_JITTER_MAX_MS = 1_000;

/** Bound queue growth while disconnected. */
const MAX_QUEUED_MESSAGES = 1_000;

/** How long queued requests may wait for reconnection before failing. */
const QUEUED_REQUEST_TIMEOUT_MS = 120_000;

const DEBUG = !!process.env['AGENTUITY_DEBUG'];

function log(message: string): void {
	if (DEBUG) console.error(`[agentuity-coder] ${message}`);
}

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'closed';

type FireAndForgetMessage = HubClientMessage | Record<string, unknown>;

interface QueuedFireAndForgetMessage {
	kind: 'fire-and-forget';
	message: FireAndForgetMessage;
}

interface QueuedRequestMessage {
	kind: 'request';
	request: HubRequest;
	resolve: (resp: HubResponse) => void;
	reject: (err: Error) => void;
	queueTimer: ReturnType<typeof setTimeout>;
}

type QueuedMessage = QueuedFireAndForgetMessage | QueuedRequestMessage;

export class HubClient {
	private ws: WebSocket | null = null;
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private intentionallyClosed = false;
	private lastConnectUrl: string | null = null;
	private queue: QueuedMessage[] = [];
	private connectionStateListeners = new Set<(state: ConnectionState) => void>();
	private pending = new Map<
		string,
		{
			resolve: (resp: HubResponse) => void;
			reject: (err: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

	public connectionState: ConnectionState = 'closed';
	public onConnectionStateChange?: (state: ConnectionState) => void;
	public onBeforeReconnect?: () => Promise<void>;
	public onInitMessage?: (initMessage: InitMessage) => void;
	/** Called when an unsolicited server message arrives (broadcast, presence, hydration). */
	public onServerMessage?: (message: Record<string, unknown>) => void;

	/** Hub auth token from the CLI environment. */
	public apiKey: string | null = null;

	private setConnectionState(state: ConnectionState): void {
		if (this.connectionState === state) return;
		this.connectionState = state;
		this.onConnectionStateChange?.(state);
		for (const listener of this.connectionStateListeners) listener(state);
	}

	private buildWebSocketUrl(url: string): string {
		let wsUrl = url;
		if (wsUrl.startsWith('http://')) {
			wsUrl = 'ws://' + wsUrl.slice(7);
		} else if (wsUrl.startsWith('https://')) {
			wsUrl = 'wss://' + wsUrl.slice(8);
		} else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
			wsUrl = 'ws://' + wsUrl;
		}
		return wsUrl;
	}

	private enqueue(message: QueuedMessage): void {
		if (this.queue.length >= MAX_QUEUED_MESSAGES) {
			const dropped = this.queue.shift();
			if (dropped?.kind === 'request') {
				clearTimeout(dropped.queueTimer);
				dropped.reject(
					new Error('Dropped queued request because queue reached maximum capacity')
				);
			}
			log(`Queue full (${MAX_QUEUED_MESSAGES}); dropping oldest queued message`);
		}

		this.queue.push(message);
	}

	private sendRequestNow(request: HubRequest): Promise<HubResponse> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error('WebSocket is not connected'));
		}

		return new Promise<HubResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				const entry = this.pending.get(request.id);
				if (entry) {
					this.pending.delete(request.id);
					entry.reject(
						new Error(
							`Hub response timeout after ${SEND_TIMEOUT_MS}ms for request ${request.id}`
						)
					);
				}
			}, SEND_TIMEOUT_MS);

			this.pending.set(request.id, { resolve, reject, timer });
			this.ws!.send(JSON.stringify(request));
		});
	}

	private sendFireAndForgetNow(message: FireAndForgetMessage): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.enqueue({ kind: 'fire-and-forget', message });
			return;
		}
		this.ws.send(JSON.stringify(message));
	}

	private async flushQueue(): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		if (this.queue.length === 0) return;

		const items = this.queue;
		this.queue = [];
		log(`Replaying ${items.length} queued message(s)`);

		for (let i = 0; i < items.length; i++) {
			const item = items[i]!;
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				this.queue = items.slice(i).concat(this.queue);
				return;
			}

			if (item.kind === 'fire-and-forget') {
				this.ws.send(JSON.stringify(item.message));
				continue;
			}

			clearTimeout(item.queueTimer);
			this.sendRequestNow(item.request).then(item.resolve).catch(item.reject);
		}
	}

	private handleUnexpectedClose(): void {
		for (const [id, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(new Error('WebSocket closed while request in-flight'));
			this.pending.delete(id);
		}

		this.ws = null;

		if (this.intentionallyClosed) {
			return;
		}

		this.setConnectionState('disconnected');
		this.startReconnectLoop();
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private rejectQueuedRequests(reason: string): void {
		for (const item of this.queue) {
			if (item.kind !== 'request') continue;
			clearTimeout(item.queueTimer);
			item.reject(new Error(reason));
		}
		this.queue = [];
	}

	private startReconnectLoop(): void {
		if (this.reconnectTimer || this.intentionallyClosed) return;
		if (!this.lastConnectUrl) {
			log('Cannot reconnect: missing previous connection URL');
			return;
		}

		const attemptReconnect = (): void => {
			if (this.intentionallyClosed) {
				this.reconnectTimer = null;
				return;
			}

			if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
				log(`Reconnect failed after ${RECONNECT_MAX_ATTEMPTS} attempts; giving up`);
				this.reconnectTimer = null;
				this.setConnectionState('disconnected');
				this.rejectQueuedRequests(
					'Reconnect attempts exhausted before queued request could be sent'
				);
				return;
			}

			const attempt = this.reconnectAttempts + 1;
			const delay = Math.min(
				RECONNECT_MAX_DELAY_MS,
				RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts
			);
			const jitter = Math.floor(Math.random() * (RECONNECT_JITTER_MAX_MS + 1));
			const waitMs = delay + jitter;

			this.setConnectionState('reconnecting');
			log(
				`Reconnect attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS} in ${waitMs}ms ` +
					`(base=${delay}ms, jitter=${jitter}ms)`
			);

			this.reconnectTimer = setTimeout(async () => {
				this.reconnectTimer = null;
				if (this.intentionallyClosed) return;

				try {
					if (this.onBeforeReconnect) {
						await this.onBeforeReconnect();
					}
					await this.connectInternal(this.lastConnectUrl!, true);
					this.reconnectAttempts = 0;
					log('Reconnected to Hub successfully');
				} catch (err) {
					this.reconnectAttempts += 1;
					log(
						`Reconnect attempt ${attempt} failed: ${
							err instanceof Error ? err.message : String(err)
						}`
					);
					attemptReconnect();
				}
			}, waitMs);
		};

		attemptReconnect();
	}

	private async connectInternal(url: string, isReconnect = false): Promise<InitMessage> {
		const wsUrl = this.buildWebSocketUrl(url);
		const orgId = process.env.AGENTUITY_ORGID;
		// Bun extension: custom headers on WebSocket upgrade request
		const headers = applyCoderAuthHeaders({}, this.apiKey, orgId);
		const ws =
			Object.keys(headers).length > 0 ? new WebSocket(wsUrl, { headers }) : new WebSocket(wsUrl);
		this.ws = ws;

		return new Promise((resolve, reject) => {
			let initResolved = false;

			const connectTimer = setTimeout(() => {
				if (!initResolved) {
					reject(new Error(`Hub did not send init message within ${CONNECT_TIMEOUT_MS}ms`));
					this.ws?.close();
				}
			}, CONNECT_TIMEOUT_MS);

			ws.onmessage = (event: MessageEvent) => {
				let data: Record<string, unknown>;
				try {
					const raw =
						typeof event.data === 'string'
							? event.data
							: new TextDecoder().decode(event.data as ArrayBuffer);
					data = JSON.parse(raw) as Record<string, unknown>;
				} catch {
					// Malformed or non-JSON frame — ignore
					return;
				}

				// First message should be init
				if (data.type === 'init' && !initResolved) {
					initResolved = true;
					clearTimeout(connectTimer);
					const initMessage = data as unknown as InitMessage;
					this.onInitMessage?.(initMessage);
					this.setConnectionState('connected');
					void this.flushQueue();
					resolve(initMessage);
					return;
				}

				// Explicit server-side rejection before init (expired session, duplicate lead, etc.)
				if (!initResolved && data.type === 'connection_rejected') {
					clearTimeout(connectTimer);
					this.intentionallyClosed = true;
					const code = typeof data.code === 'string' ? data.code : 'unknown';
					const message =
						typeof data.message === 'string' ? data.message : 'Connection rejected';
					reject(new Error(`Hub rejected connection (${code}): ${message}`));
					try {
						this.ws?.close();
					} catch {
						/* ignore */
					}
					return;
				}

				// Unsolicited server messages (broadcast, presence, hydration)
				// These have a `type` field but no `id` matching a pending request.
				const msgType = data.type as string | undefined;
				if (
					msgType === 'broadcast' ||
					msgType === 'presence' ||
					msgType === 'session_hydration' ||
					msgType === 'session_resume' ||
					msgType === 'session_stream_ready' ||
					msgType === 'protocol_error' ||
					msgType === 'rpc_command' ||
					msgType === 'rpc_command_error' ||
					msgType === 'rpc_event' ||
					msgType === 'rpc_response' ||
					msgType === 'rpc_ui_request'
				) {
					this.onServerMessage?.(data);
					return;
				}

				// Otherwise it's a response to a pending request
				const response = data as unknown as HubResponse;
				const entry = this.pending.get(response.id);
				if (entry) {
					clearTimeout(entry.timer);
					this.pending.delete(response.id);
					entry.resolve(response);
				}
			};

			ws.onerror = (err: Event) => {
				if (initResolved) return;

				const message =
					'message' in err && typeof (err as ErrorEvent).message === 'string'
						? (err as ErrorEvent).message
						: `connection to ${wsUrl} failed`;
				clearTimeout(connectTimer);
				reject(new Error(`WebSocket error: ${message}`));
			};

			ws.onclose = (event: CloseEvent) => {
				clearTimeout(connectTimer);
				if (!initResolved) {
					const reason = event.reason ? ` (${event.reason})` : '';
					reject(
						new Error(
							`WebSocket closed before init message received (code ${event.code})${reason}`
						)
					);
				}
				if (isReconnect) {
					this.setConnectionState('disconnected');
				}
				this.handleUnexpectedClose();
			};
		});
	}

	async connect(
		url: string,
		opts?: { sessionId?: string; role?: string; origin?: string }
	): Promise<InitMessage> {
		if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
			throw new Error('Already connected or connecting — call close() first');
		}

		this.intentionallyClosed = false;

		// Append query params for session/role targeting
		let connectUrl = url;
		if (opts?.sessionId) {
			const separator = connectUrl.includes('?') ? '&' : '?';
			connectUrl = `${connectUrl}${separator}sessionId=${encodeURIComponent(opts.sessionId)}`;
		}
		if (opts?.role) {
			const separator = connectUrl.includes('?') ? '&' : '?';
			connectUrl = `${connectUrl}${separator}role=${encodeURIComponent(opts.role)}`;
		}
		if (opts?.origin) {
			const separator = connectUrl.includes('?') ? '&' : '?';
			connectUrl = `${connectUrl}${separator}origin=${encodeURIComponent(opts.origin)}`;
		}

		this.lastConnectUrl = connectUrl;
		this.reconnectAttempts = 0;
		this.clearReconnectTimer();

		return this.connectInternal(connectUrl, false);
	}

	private waitForConnection(timeoutMs: number): Promise<void> {
		if (this.connected) return Promise.resolve();

		if (this.connectionState === 'disconnected') {
			this.startReconnectLoop();
		}

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`Timed out waiting for Hub reconnection after ${timeoutMs}ms`));
			}, timeoutMs);

			const listener = (state: ConnectionState): void => {
				if (state !== 'connected') return;
				cleanup();
				resolve();
			};

			const cleanup = (): void => {
				clearTimeout(timer);
				this.connectionStateListeners.delete(listener);
			};

			this.connectionStateListeners.add(listener);
		});
	}

	nextId(): string {
		return crypto.randomUUID();
	}

	async send(request: HubRequest): Promise<HubResponse> {
		if (this.connectionState === 'closed') {
			throw new Error('WebSocket client is closed');
		}

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return new Promise<HubResponse>((resolve, reject) => {
				const queuedEntry: QueuedRequestMessage = {
					kind: 'request',
					request,
					resolve,
					reject,
					queueTimer: setTimeout(() => {
						this.queue = this.queue.filter((item) => item !== queuedEntry);
						reject(
							new Error(
								`Timed out waiting ${QUEUED_REQUEST_TIMEOUT_MS}ms for Hub reconnection`
							)
						);
					}, QUEUED_REQUEST_TIMEOUT_MS),
				};

				this.enqueue(queuedEntry);

				if (this.connectionState === 'disconnected') {
					this.startReconnectLoop();
				}
			});
		}

		return this.sendRequestNow(request);
	}

	sendNoWait(message: HubClientMessage | Record<string, unknown>): void {
		if (this.connectionState === 'closed') {
			log('Dropping fire-and-forget message because client is closed');
			return;
		}

		this.sendFireAndForgetNow(message);

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			if (this.connectionState === 'disconnected') {
				this.startReconnectLoop();
			}
		}
	}

	async waitUntilConnected(timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
		await this.waitForConnection(timeoutMs);
	}

	close(): void {
		this.intentionallyClosed = true;
		this.setConnectionState('closed');
		this.clearReconnectTimer();

		for (const item of this.queue) {
			if (item.kind !== 'request') continue;
			clearTimeout(item.queueTimer);
			item.reject(new Error('WebSocket client closed before queued request was sent'));
		}
		this.queue = [];

		for (const [id, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(new Error('WebSocket client closed'));
			this.pending.delete(id);
		}

		if (this.ws) {
			// Detach handlers so the stale onclose doesn't trigger reconnect
			// after a subsequent connect() resets intentionallyClosed.
			this.ws.onclose = null;
			this.ws.onerror = null;
			this.ws.onmessage = null;
			this.ws.close();
			this.ws = null;
		}
	}

	get connected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}
}
