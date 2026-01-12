import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InferInput, InferOutput } from '@agentuity/core';
import { buildUrl, WebSocketManager, type WebSocketRouteRegistry } from '@agentuity/frontend';
import { AgentuityContext } from './context';

// WebSocket ready state constants for SSR compatibility
// (WebSocket global may not exist during SSR)
const WS_OPEN = 1;
const WS_CLOSED = 3;

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
): {
	isConnected: boolean;
	close: () => void;
	data?: WebSocketRouteOutput<TRoute>;
	messages: WebSocketRouteOutput<TRoute>[];
	clearMessages: () => void;
	error: Error | null;
	isError: boolean;
	reset: () => void;
	send: (data: WebSocketRouteInput<TRoute>) => void;
	readyState: WebSocket['readyState'];
} {
	const context = useContext(AgentuityContext);

	if (!context) {
		throw new Error('useWebsocket must be used within a AgentuityProvider');
	}

	const managerRef = useRef<WebSocketManager<
		WebSocketRouteInput<TRoute>,
		WebSocketRouteOutput<TRoute>
	> | null>(null);

	const [data, setData] = useState<WebSocketRouteOutput<TRoute>>();
	const [messages, setMessages] = useState<WebSocketRouteOutput<TRoute>[]>([]);
	const [error, setError] = useState<Error | null>(null);
	const [isError, setIsError] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [readyState, setReadyState] = useState<number>(WS_CLOSED);

	// Build WebSocket URL
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

		return buildUrl(wsBase, route as string, options?.subpath, queryParams);
	}, [context.baseUrl, context.authHeader, route, options?.subpath, options?.query?.toString()]);

	// Initialize manager and connect
	useEffect(() => {
		const manager = new WebSocketManager<
			WebSocketRouteInput<TRoute>,
			WebSocketRouteOutput<TRoute>
		>({
			url: wsUrl,
			callbacks: {
				onConnect: () => {
					setIsConnected(true);
					setError(null);
					setIsError(false);
					setReadyState(WS_OPEN);
				},
				onDisconnect: () => {
					setIsConnected(false);
					setReadyState(WS_CLOSED);
				},
				onError: (err) => {
					setError(err);
					setIsError(true);
				},
			},
		});

		// Set message handler
		manager.setMessageHandler((message) => {
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

		manager.connect();
		managerRef.current = manager;

		return () => {
			manager.dispose();
			managerRef.current = null;
		};
	}, [wsUrl, options?.maxMessages]);

	// Handle abort signal
	useEffect(() => {
		if (options?.signal) {
			const listener = () => {
				managerRef.current?.close();
			};
			options.signal.addEventListener('abort', listener);
			return () => {
				options.signal?.removeEventListener('abort', listener);
			};
		}
	}, [options?.signal]);

	const reset = useCallback(() => {
		setError(null);
		setIsError(false);
	}, []);

	const send = useCallback((sendData: WebSocketRouteInput<TRoute>) => {
		managerRef.current?.send(sendData);
	}, []);

	const close = useCallback(() => {
		managerRef.current?.close();
	}, []);

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
