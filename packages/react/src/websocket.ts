import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InferInput, InferOutput } from '@agentuity/core';
import { AgentuityContext } from './context';
import { buildUrl } from './url';
import { deserializeData } from './serialization';
import { createReconnectManager } from './reconnect';
import type { WebSocketRouteRegistry } from './types';

type onMessageHandler<T = unknown> = (data: T) => void;

/**
 * Extract WebSocket route keys (e.g., '/ws', '/chat')
 */
export type WebSocketRouteKey = keyof WebSocketRouteRegistry;

/**
 * Extract input type for a WebSocket route
 */
export type WebSocketRouteInput<TRoute extends WebSocketRouteKey> =
	TRoute extends keyof WebSocketRouteRegistry
		? WebSocketRouteRegistry[TRoute] extends { inputSchema: infer TSchema }
			? TSchema extends undefined | never
				? never
				: InferInput<TSchema>
			: never
		: never;

/**
 * Extract output type for a WebSocket route
 */
export type WebSocketRouteOutput<TRoute extends WebSocketRouteKey> =
	TRoute extends keyof WebSocketRouteRegistry
		? WebSocketRouteRegistry[TRoute] extends { outputSchema: infer TSchema }
			? TSchema extends undefined | never
				? void
				: InferOutput<TSchema>
			: void
		: void;

/**
 * Options for WebSocket hooks
 */
export interface WebsocketOptions {
	/**
	 * Optional query parameters to append to the websocket URL
	 */
	query?: URLSearchParams;
	/**
	 * Optional subpath to append to the websocket path
	 */
	subpath?: string;
	/**
	 * Optional AbortSignal to cancel the websocket connection
	 */
	signal?: AbortSignal;
	/**
	 * Maximum number of messages to keep in the messages array.
	 * When exceeded, oldest messages are removed.
	 * @default undefined (no limit)
	 */
	maxMessages?: number;
}

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

interface WebsocketResponseInternal<TInput, TOutput> {
	/** Whether WebSocket is currently connected */
	isConnected: boolean;
	/** Error if connection or message failed */
	error: Error | null;
	/** Whether an error has occurred */
	isError: boolean;
	/** Send data through the WebSocket */
	send: (data: TInput) => void;
	/** Set handler for incoming messages */
	setHandler: (handler: onMessageHandler<TOutput>) => void;
	/** WebSocket connection state (CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3) */
	readyState: WebSocket['readyState'];
	/** Close the WebSocket connection */
	close: () => void;
	/** Reset state to initial values */
	reset: () => void;
}

const useWebsocketInternal = <TInput, TOutput>(
	path: string,
	options?: WebsocketOptions
): WebsocketResponseInternal<TInput, TOutput> => {
	const context = useContext(AgentuityContext);

	if (!context) {
		throw new Error('useWebsocket must be used within a AgentuityProvider');
	}

	const manualClose = useRef(false);
	const wsRef = useRef<WebSocket | undefined>(undefined);
	const pending = useRef<TOutput[]>([]);
	const queued = useRef<TInput[]>([]);
	const handler = useRef<onMessageHandler<TOutput> | undefined>(undefined);
	const reconnectManagerRef = useRef<ReturnType<typeof createReconnectManager> | undefined>(
		undefined
	);

	const [error, setError] = useState<Error | null>(null);
	const [isError, setIsError] = useState(false);
	const [isConnected, setIsConnected] = useState(false);

	const wsUrl = useMemo(() => {
		const base = context.baseUrl!;
		const wsBase = base.replace(/^http(s?):/, 'ws$1:');

		// Add auth token to query params if present
		// (WebSocket doesn't support custom headers, so we pass via query string)
		let queryParams = options?.query;
		if (context.authHeader) {
			const token = context.authHeader.replace(/^Bearer\s+/i, '');
			const authQuery = new URLSearchParams({ token });
			if (queryParams) {
				queryParams = new URLSearchParams([...queryParams, ...authQuery]);
			} else {
				queryParams = authQuery;
			}
		}

		return buildUrl(wsBase, path, options?.subpath, queryParams);
	}, [context.baseUrl, context.authHeader, path, options?.subpath, options?.query?.toString()]);

	const connect = useCallback(() => {
		if (manualClose.current) return;

		wsRef.current = new WebSocket(wsUrl);

		wsRef.current.onopen = () => {
			reconnectManagerRef.current?.recordSuccess();
			setIsConnected(true);
			setError(null);
			setIsError(false);
			if (queued.current.length > 0) {
				queued.current.forEach((msg: unknown) => wsRef.current!.send(serializeWSData(msg)));
				queued.current = [];
			}
		};

		wsRef.current.onerror = () => {
			setError(new Error('WebSocket error'));
			setIsError(true);
		};

		wsRef.current.onclose = (evt) => {
			wsRef.current = undefined;
			setIsConnected(false);
			if (manualClose.current) {
				queued.current = [];
				return;
			}
			if (evt.code !== 1000) {
				setError(new Error(`WebSocket closed: ${evt.code} ${evt.reason || ''}`));
				setIsError(true);
			}
			reconnectManagerRef.current?.recordFailure();
		};

		wsRef.current.onmessage = (event: { data: string }) => {
			const payload = deserializeData<TOutput>(event.data);
			if (handler.current) {
				handler.current(payload);
			} else {
				pending.current.push(payload);
			}
		};
	}, [wsUrl]);

	useEffect(() => {
		reconnectManagerRef.current = createReconnectManager({
			onReconnect: connect,
			threshold: 0,
			baseDelay: 500,
			factor: 2,
			maxDelay: 30000,
			jitter: 500,
			enabled: () => !manualClose.current,
		});
		return () => reconnectManagerRef.current?.dispose();
	}, [connect]);

	const cleanup = useCallback(() => {
		manualClose.current = true;
		reconnectManagerRef.current?.dispose();
		const ws = wsRef.current;
		if (ws) {
			ws.onopen = null;
			ws.onerror = null;
			ws.onclose = null;
			ws.onmessage = null;
			ws.close();
		}
		wsRef.current = undefined;
		handler.current = undefined;
		pending.current = [];
		queued.current = [];
		setIsConnected(false);
	}, []);

	useEffect(() => {
		manualClose.current = false;
		connect();

		return () => {
			cleanup();
		};
	}, [connect, cleanup]);

	useEffect(() => {
		if (options?.signal) {
			const listener = () => {
				cleanup();
			};
			options.signal.addEventListener('abort', listener);
			return () => {
				options.signal?.removeEventListener('abort', listener);
			};
		}
	}, [options?.signal, cleanup]);

	const reset = () => {
		setError(null);
		setIsError(false);
	};

	const send = (data: TInput) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(serializeWSData(data));
		} else {
			queued.current.push(data);
		}
	};

	const setHandler = useCallback((h: onMessageHandler<TOutput>) => {
		handler.current = h;
		pending.current.forEach(h);
		pending.current = [];
	}, []);

	const close = () => {
		cleanup();
	};

	return {
		isConnected,
		close,
		error,
		isError,
		send,
		setHandler,
		reset,
		readyState: wsRef.current?.readyState ?? WebSocket.CLOSED,
	};
};

/**
 * Type-safe WebSocket hook for connecting to WebSocket routes.
 *
 * Provides automatic type inference for route inputs and outputs based on
 * the WebSocketRouteRegistry generated from your routes.
 *
 * @template TRoute - WebSocket route key from WebSocketRouteRegistry (e.g., '/ws', '/chat')
 *
 * @example Simple WebSocket connection
 * ```typescript
 * const { isConnected, data, send } = useWebsocket('/ws');
 *
 * // Send typed data
 * send({ message: 'Hello' }); // Fully typed based on route schema!
 * ```
 *
 * @example WebSocket with query parameters
 * ```typescript
 * const { isConnected, data, send } = useWebsocket('/chat', {
 *   query: new URLSearchParams({ room: 'general' })
 * });
 * ```
 *
 * @example Access all messages (prevents message loss in rapid succession)
 * ```typescript
 * const { messages, clearMessages } = useWebsocket('/chat');
 *
 * // messages array contains ALL received messages
 * messages.forEach(msg => console.log(msg));
 *
 * // Clear messages when needed
 * clearMessages();
 * ```
 */
export function useWebsocket<TRoute extends WebSocketRouteKey>(
	route: TRoute,
	options?: WebsocketOptions
): Omit<
	WebsocketResponseInternal<WebSocketRouteInput<TRoute>, WebSocketRouteOutput<TRoute>>,
	'setHandler'
> & {
	data?: WebSocketRouteOutput<TRoute>;
	messages: WebSocketRouteOutput<TRoute>[];
	clearMessages: () => void;
} {
	const [data, setData] = useState<WebSocketRouteOutput<TRoute>>();
	const [messages, setMessages] = useState<WebSocketRouteOutput<TRoute>[]>([]);
	const { isConnected, close, send, setHandler, readyState, error, isError, reset } =
		useWebsocketInternal<WebSocketRouteInput<TRoute>, WebSocketRouteOutput<TRoute>>(
			route as string,
			options
		);

	useEffect(() => {
		setHandler((message) => {
			setData(message);
			setMessages((prev) => {
				const newMessages = [...prev, message];
				// Enforce maxMessages limit if specified
				if (options?.maxMessages && newMessages.length > options.maxMessages) {
					return newMessages.slice(-options.maxMessages);
				}
				return newMessages;
			});
		});
	}, [route, setHandler, options?.maxMessages]);

	const clearMessages = useCallback(() => {
		setMessages([]);
	}, []);

	return {
		isConnected,
		close,
		data,
		messages,
		clearMessages,
		error,
		isError,
		reset,
		send,
		readyState,
	};
}
