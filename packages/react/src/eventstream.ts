import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InferOutput } from '@agentuity/core';
import { AgentuityContext } from './context';
import { buildUrl } from './url';
import { deserializeData } from './serialization';
import { createReconnectManager } from './reconnect';
import { jsonEqual } from './memo';
import type { SSERouteRegistry } from './types';

type onMessageHandler<T = unknown> = (data: T) => void;

/**
 * Extract SSE route keys (e.g., '/events', '/notifications')
 */
export type SSERouteKey = keyof SSERouteRegistry;

/**
 * Extract output type for an SSE route (SSE is typically one-way server->client)
 */
export type SSERouteOutput<TRoute extends SSERouteKey> = TRoute extends keyof SSERouteRegistry
	? SSERouteRegistry[TRoute] extends { outputSchema: infer TSchema }
		? TSchema extends undefined | never
			? void
			: InferOutput<TSchema>
		: void
	: void;

/**
 * Options for EventStream hooks
 */
export interface EventStreamOptions {
	/**
	 * Optional query parameters to append to the EventStream URL
	 */
	query?: URLSearchParams;
	/**
	 * Optional subpath to append to the EventStream path
	 */
	subpath?: string;
	/**
	 * Optional AbortSignal to cancel the EventStream connection
	 */
	signal?: AbortSignal;
}

interface EventStreamResponseInternal<TOutput> {
	/** Whether EventStream is currently connected */
	isConnected: boolean;
	/** Most recent data received from EventStream */
	data?: TOutput;
	/** Error if connection or message failed */
	error: Error | null;
	/** Whether an error has occurred */
	isError: boolean;
	/** Set handler for incoming messages (use data property instead) */
	setHandler: (handler: onMessageHandler<TOutput>) => void;
	/** EventStream connection state (CONNECTING=0, OPEN=1, CLOSED=2) */
	readyState: number;
	/** Close the EventStream connection */
	close: () => void;
	/** Reset state to initial values */
	reset: () => void;
}

const useEventStreamInternal = <TOutput>(
	path: string,
	options?: EventStreamOptions
): EventStreamResponseInternal<TOutput> => {
	const context = useContext(AgentuityContext);

	if (!context) {
		throw new Error('useEventStream must be used within a AgentuityProvider');
	}

	const manualClose = useRef(false);
	const esRef = useRef<EventSource | undefined>(undefined);
	const pending = useRef<TOutput[]>([]);
	const handler = useRef<onMessageHandler<TOutput> | undefined>(undefined);
	const reconnectManagerRef = useRef<ReturnType<typeof createReconnectManager> | undefined>(
		undefined
	);

	const [data, setData] = useState<TOutput>();
	const [error, setError] = useState<Error | null>(null);
	const [isError, setIsError] = useState(false);
	const [isConnected, setIsConnected] = useState(false);

	const esUrl = useMemo(
		() => buildUrl(context.baseUrl!, path, options?.subpath, options?.query),
		[context.baseUrl, path, options?.subpath, options?.query?.toString()]
	);

	const connect = useCallback(() => {
		if (manualClose.current) return;

		esRef.current = new EventSource(esUrl);
		let firstMessageReceived = false;

		esRef.current.onopen = () => {
			reconnectManagerRef.current?.recordSuccess();
			setIsConnected(true);
			setError(null);
			setIsError(false);
		};

		esRef.current.onerror = () => {
			setError(new Error('EventStream error'));
			setIsError(true);
			setIsConnected(false);

			if (manualClose.current) {
				return;
			}

			const result = reconnectManagerRef.current?.recordFailure();
			if (result?.scheduled) {
				const es = esRef.current;
				if (es) {
					es.onopen = null;
					es.onerror = null;
					es.onmessage = null;
					es.close();
				}
				esRef.current = undefined;
			}
		};

		esRef.current.onmessage = (event: MessageEvent) => {
			if (!firstMessageReceived) {
				reconnectManagerRef.current?.recordSuccess();
				firstMessageReceived = true;
			}
			const payload = deserializeData<TOutput>(event.data);
			// Use JSON memoization to prevent re-renders when data hasn't changed
			setData((prev) => (prev !== undefined && jsonEqual(prev, payload) ? prev : payload));
			if (handler.current) {
				handler.current(payload);
			} else {
				pending.current.push(payload);
			}
		};
	}, [esUrl]);

	useEffect(() => {
		reconnectManagerRef.current = createReconnectManager({
			onReconnect: connect,
			threshold: 3,
			baseDelay: 500,
			factor: 2,
			maxDelay: 30000,
			jitter: 250,
			enabled: () => !manualClose.current,
		});
		return () => reconnectManagerRef.current?.dispose();
	}, [connect]);

	const cleanup = useCallback(() => {
		manualClose.current = true;
		reconnectManagerRef.current?.dispose();
		const es = esRef.current;
		if (es) {
			es.onopen = null;
			es.onerror = null;
			es.onmessage = null;
			es.close();
		}
		esRef.current = undefined;
		handler.current = undefined;
		pending.current = [];
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
		data,
		error,
		isError,
		setHandler,
		reset,
		readyState: esRef.current?.readyState ?? EventSource.CLOSED,
	};
};

/**
 * Type-safe EventStream (SSE) hook for connecting to SSE routes.
 *
 * Provides automatic type inference for route outputs based on
 * the SSERouteRegistry generated from your routes.
 *
 * @template TRoute - SSE route key from SSERouteRegistry (e.g., '/events', '/notifications')
 *
 * @example Simple SSE connection
 * ```typescript
 * const { isConnected, data } = useEventStream('/events');
 *
 * // data is fully typed based on route output schema!
 * ```
 *
 * @example SSE with query parameters
 * ```typescript
 * const { isConnected, data } = useEventStream('/notifications', {
 *   query: new URLSearchParams({ userId: '123' })
 * });
 * ```
 */
export function useEventStream<TRoute extends SSERouteKey>(
	route: TRoute,
	options?: EventStreamOptions
): Omit<EventStreamResponseInternal<SSERouteOutput<TRoute>>, 'setHandler'> & {
	data?: SSERouteOutput<TRoute>;
} {
	const [data, setData] = useState<SSERouteOutput<TRoute>>();
	const { isConnected, close, setHandler, readyState, error, isError, reset } =
		useEventStreamInternal<SSERouteOutput<TRoute>>(route as string, options);

	useEffect(() => {
		setHandler(setData);
	}, [route, setHandler]);

	return {
		isConnected,
		close,
		data,
		error,
		isError,
		reset,
		readyState,
	};
}
