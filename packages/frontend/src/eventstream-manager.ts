import { createReconnectManager, type ReconnectManager } from './reconnect';
import { deserializeData } from './serialization';

/**
 * Message handler callback type
 */
export type MessageHandler<T = unknown> = (data: T) => void;

/**
 * EventStream state change callback types
 */
export interface EventStreamCallbacks<TOutput = unknown> {
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
 * Options for EventStreamManager
 */
export interface EventStreamManagerOptions<TOutput = unknown> {
	/** EventStream URL */
	url: string;
	/** Callbacks for state changes */
	callbacks?: EventStreamCallbacks<TOutput>;
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
 * EventStream manager state
 */
export interface EventStreamManagerState {
	/** Whether EventStream is currently connected */
	isConnected: boolean;
	/** Current error, if any */
	error: Error | null;
	/** EventStream ready state */
	readyState: number;
}

/**
 * Generic EventStream (SSE) connection manager with automatic reconnection
 * and handler management.
 *
 * Framework-agnostic - can be used with React, Svelte, Vue, or vanilla JS.
 */
export class EventStreamManager<TOutput = unknown> {
	private es: EventSource | undefined;
	private manualClose = false;
	private pendingMessages: TOutput[] = [];
	private messageHandler: MessageHandler<TOutput> | undefined;
	private reconnectManager: ReconnectManager | undefined;
	private callbacks: EventStreamCallbacks<TOutput>;
	private url: string;
	private reconnectConfig: Required<NonNullable<EventStreamManagerOptions<TOutput>['reconnect']>>;
	private firstMessageReceived = false;

	constructor(options: EventStreamManagerOptions<TOutput>) {
		this.url = options.url;
		this.callbacks = options.callbacks || {};
		this.reconnectConfig = {
			threshold: options.reconnect?.threshold ?? 3,
			baseDelay: options.reconnect?.baseDelay ?? 500,
			factor: options.reconnect?.factor ?? 2,
			maxDelay: options.reconnect?.maxDelay ?? 30000,
			jitter: options.reconnect?.jitter ?? 250,
		};
	}

	/**
	 * Connect to the EventStream server
	 */
	connect(): void {
		if (this.manualClose) return;

		this.es = new EventSource(this.url);
		this.firstMessageReceived = false;

		this.es.onopen = () => {
			this.reconnectManager?.recordSuccess();
			this.callbacks.onConnect?.();
		};

		this.es.onerror = () => {
			const error = new Error('EventStream error');
			this.callbacks.onError?.(error);
			this.callbacks.onDisconnect?.();

			if (this.manualClose) {
				return;
			}

			const result = this.reconnectManager?.recordFailure();
			if (result?.scheduled) {
				// Close current connection before reconnecting
				if (this.es) {
					this.es.onopen = null;
					this.es.onerror = null;
					this.es.onmessage = null;
					this.es.close();
				}
				this.es = undefined;
			}
		};

		this.es.onmessage = (event: MessageEvent) => {
			// Record success on first message (not just on open)
			if (!this.firstMessageReceived) {
				this.reconnectManager?.recordSuccess();
				this.firstMessageReceived = true;
			}

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
	getState(): EventStreamManagerState {
		return {
			isConnected: this.es?.readyState === EventSource.OPEN,
			error: null, // Error state managed externally via callbacks
			readyState: this.es?.readyState ?? EventSource.CLOSED,
		};
	}

	/**
	 * Close the EventStream connection and cleanup
	 */
	close(): void {
		this.manualClose = true;
		this.reconnectManager?.dispose();

		if (this.es) {
			this.es.onopen = null;
			this.es.onerror = null;
			this.es.onmessage = null;
			this.es.close();
		}

		this.es = undefined;
		this.messageHandler = undefined;
		this.pendingMessages = [];

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
