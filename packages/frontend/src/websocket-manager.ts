import { createReconnectManager, type ReconnectManager } from './reconnect';
import { deserializeData } from './serialization';

/**
 * Serialize data for WebSocket transmission
 */
const serializeWSData = (
	data: unknown
): string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike> => {
	if (typeof data === 'string') {
		return data;
	}
	if (typeof data === 'object') {
		if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof Blob) {
			return data;
		}
		return JSON.stringify(data);
	}
	throw new Error('unsupported data type for websocket: ' + typeof data);
};

/**
 * Message handler callback type
 */
export type MessageHandler<T = unknown> = (data: T) => void;

/**
 * WebSocket state change callback types
 */
export interface WebSocketCallbacks<TOutput = unknown> {
	/** Called when connection is established */
	onConnect?: () => void;
	/** Called when connection is closed */
	onDisconnect?: () => void;
	/** Called when an error occurs */
	onError?: (error: Error) => void;
	/** Called when a message is received */
	onMessage?: MessageHandler<TOutput>;
}

/**
 * Options for WebSocketManager
 */
export interface WebSocketManagerOptions<TOutput = unknown> {
	/** WebSocket URL */
	url: string;
	/** Callbacks for state changes */
	callbacks?: WebSocketCallbacks<TOutput>;
	/** Reconnection configuration */
	reconnect?: {
		threshold?: number;
		baseDelay?: number;
		factor?: number;
		maxDelay?: number;
		jitter?: number;
	};
}

/**
 * WebSocket manager state
 */
export interface WebSocketManagerState {
	/** Whether WebSocket is currently connected */
	isConnected: boolean;
	/** Current error, if any */
	error: Error | null;
	/** WebSocket ready state */
	readyState: number;
}

/**
 * Generic WebSocket connection manager with automatic reconnection,
 * message queuing, and handler management.
 *
 * Framework-agnostic - can be used with React, Svelte, Vue, or vanilla JS.
 */
export class WebSocketManager<TInput = unknown, TOutput = unknown> {
	private ws: WebSocket | undefined;
	private manualClose = false;
	private pendingMessages: TOutput[] = [];
	private queuedMessages: TInput[] = [];
	private messageHandler: MessageHandler<TOutput> | undefined;
	private reconnectManager: ReconnectManager | undefined;
	private callbacks: WebSocketCallbacks<TOutput>;
	private url: string;
	private reconnectConfig: Required<NonNullable<WebSocketManagerOptions<TOutput>['reconnect']>>;

	constructor(options: WebSocketManagerOptions<TOutput>) {
		this.url = options.url;
		this.callbacks = options.callbacks || {};
		this.reconnectConfig = {
			threshold: options.reconnect?.threshold ?? 0,
			baseDelay: options.reconnect?.baseDelay ?? 500,
			factor: options.reconnect?.factor ?? 2,
			maxDelay: options.reconnect?.maxDelay ?? 30000,
			jitter: options.reconnect?.jitter ?? 500,
		};
	}

	/**
	 * Connect to the WebSocket server
	 */
	connect(): void {
		if (this.manualClose) return;

		this.ws = new WebSocket(this.url);

		this.ws.onopen = () => {
			this.reconnectManager?.recordSuccess();
			this.callbacks.onConnect?.();

			// Flush queued messages
			if (this.queuedMessages.length > 0) {
				this.queuedMessages.forEach((msg) => this.ws!.send(serializeWSData(msg)));
				this.queuedMessages = [];
			}
		};

		this.ws.onerror = () => {
			const error = new Error('WebSocket error');
			this.callbacks.onError?.(error);
		};

		this.ws.onclose = (evt) => {
			this.ws = undefined;
			this.callbacks.onDisconnect?.();

			if (this.manualClose) {
				this.queuedMessages = [];
				return;
			}

			if (evt.code !== 1000) {
				const error = new Error(`WebSocket closed: ${evt.code} ${evt.reason || ''}`);
				this.callbacks.onError?.(error);
			}

			this.reconnectManager?.recordFailure();
		};

		this.ws.onmessage = (event: MessageEvent) => {
			const payload = deserializeData<TOutput>(event.data);

			// Call the registered message handler
			if (this.messageHandler) {
				this.messageHandler(payload);
			} else {
				// Buffer messages until a handler is set
				this.pendingMessages.push(payload);
			}

			// Also call the callback if provided
			this.callbacks.onMessage?.(payload);
		};

		// Setup reconnect manager
		if (!this.reconnectManager) {
			this.reconnectManager = createReconnectManager({
				onReconnect: () => this.connect(),
				threshold: this.reconnectConfig.threshold,
				baseDelay: this.reconnectConfig.baseDelay,
				factor: this.reconnectConfig.factor,
				maxDelay: this.reconnectConfig.maxDelay,
				jitter: this.reconnectConfig.jitter,
				enabled: () => !this.manualClose,
			});
		}
	}

	/**
	 * Send data through the WebSocket.
	 * Messages are queued if not currently connected.
	 */
	send(data: TInput): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(serializeWSData(data));
		} else {
			this.queuedMessages.push(data);
		}
	}

	/**
	 * Set the message handler.
	 * Any buffered messages will be delivered immediately.
	 */
	setMessageHandler(handler: MessageHandler<TOutput>): void {
		this.messageHandler = handler;
		// Flush pending messages
		this.pendingMessages.forEach(handler);
		this.pendingMessages = [];
	}

	/**
	 * Get current state
	 */
	getState(): WebSocketManagerState {
		return {
			isConnected: this.ws?.readyState === WebSocket.OPEN,
			error: null, // Error state managed externally via callbacks
			readyState: this.ws?.readyState ?? WebSocket.CLOSED,
		};
	}

	/**
	 * Close the WebSocket connection and cleanup
	 */
	close(): void {
		this.manualClose = true;
		this.reconnectManager?.dispose();

		if (this.ws) {
			this.ws.onopen = null;
			this.ws.onerror = null;
			this.ws.onclose = null;
			this.ws.onmessage = null;
			this.ws.close();
		}

		this.ws = undefined;
		this.messageHandler = undefined;
		this.pendingMessages = [];
		this.queuedMessages = [];

		// Notify disconnect callback
		this.callbacks.onDisconnect?.();
	}

	/**
	 * Dispose of the manager (alias for close)
	 */
	dispose(): void {
		this.close();
	}
}
