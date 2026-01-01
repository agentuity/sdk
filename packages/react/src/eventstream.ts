import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InferOutput } from '@agentuity/core';
import { buildUrl, EventStreamManager, jsonEqual } from '@agentuity/frontend';
import type { SSERouteRegistry } from './types';
import { AgentuityContext } from './context';

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
): {
	isConnected: boolean;
	close: () => void;
	data?: SSERouteOutput<TRoute>;
	error: Error | null;
	isError: boolean;
	reset: () => void;
	readyState: number;
} {
	const context = useContext(AgentuityContext);

	if (!context) {
		throw new Error('useEventStream must be used within a AgentuityProvider');
	}

	const managerRef = useRef<EventStreamManager<SSERouteOutput<TRoute>> | null>(null);

	const [data, setData] = useState<SSERouteOutput<TRoute>>();
	const [error, setError] = useState<Error | null>(null);
	const [isError, setIsError] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [readyState, setReadyState] = useState<number>(2); // EventSource.CLOSED = 2

	// Build EventStream URL
	const esUrl = useMemo(
		() => buildUrl(context.baseUrl!, route as string, options?.subpath, options?.query),
		[context.baseUrl, route, options?.subpath, options?.query?.toString()]
	);

	// Initialize manager and connect
	useEffect(() => {
		const manager = new EventStreamManager<SSERouteOutput<TRoute>>({
			url: esUrl,
			callbacks: {
				onConnect: () => {
					setIsConnected(true);
					setError(null);
					setIsError(false);
					setReadyState(1); // EventSource.OPEN = 1
				},
				onDisconnect: () => {
					setIsConnected(false);
					setReadyState(2); // EventSource.CLOSED = 2
				},
				onError: (err) => {
					setError(err);
					setIsError(true);
				},
			},
		});

		// Set message handler with JSON memoization
		manager.setMessageHandler((message) => {
			setData((prev) => (prev !== undefined && jsonEqual(prev, message) ? prev : message));
		});

		manager.connect();
		managerRef.current = manager;

		return () => {
			manager.dispose();
			managerRef.current = null;
		};
	}, [esUrl]);

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

	const close = useCallback(() => {
		managerRef.current?.close();
	}, []);

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
