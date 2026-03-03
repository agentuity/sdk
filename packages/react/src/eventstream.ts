import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InferOutput } from '@agentuity/core';
import {
	buildUrl,
	EventStreamManager,
	jsonEqual,
	type SSERouteRegistry,
} from '@agentuity/frontend';
import { AgentuityContext } from './context.tsx';

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
 * @template TOutput - Optional type override for SSE event data. When provided, this type
 *   is used instead of the inferred type from the route registry. This is useful for SSE
 *   routes where outputSchema is `never` in the generated types.
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
 *
 * @example SSE with custom output type (when registry has outputSchema: never)
 * ```typescript
 * interface StreamMessage {
 *   type: 'token' | 'complete';
 *   content?: string;
 * }
 *
 * const { isConnected, data } = useEventStream<'/api/search', StreamMessage>('/api/search');
 *
 * // data is typed as StreamMessage | undefined
 * if (data?.type === 'token') {
 *   console.log(data.content);
 * }
 * ```
 */
export function useEventStream<TRoute extends SSERouteKey, TOutput = SSERouteOutput<TRoute>>(
	route: TRoute,
	options?: EventStreamOptions
): {
	isConnected: boolean;
	close: () => void;
	data?: TOutput;
	error: Error | null;
	isError: boolean;
	reset: () => void;
	readyState: number;
} {
	const context = useContext(AgentuityContext);

	if (!context) {
		throw new Error('useEventStream must be used within a AgentuityProvider');
	}

	const managerRef = useRef<EventStreamManager<TOutput> | null>(null);

	const [data, setData] = useState<TOutput>();
	const [error, setError] = useState<Error | null>(null);
	const [isError, setIsError] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [readyState, setReadyState] = useState<number>(2); // EventSource.CLOSED = 2

	// Build EventStream URL
	// Track both query object and its string representation to detect mutations.
	// URLSearchParams can be mutated in-place without changing object identity,
	// so we compare the string value to trigger recomputation when params change.
	const _queryString = options?.query?.toString();
	const esUrl = useMemo(
		() => buildUrl(context.baseUrl!, route as string, options?.subpath, options?.query),
		// biome-ignore lint/correctness/useExhaustiveDependencies: queryString tracks URLSearchParams mutations that options?.query reference wouldn't catch
		[context.baseUrl, route, options?.subpath, options?.query]
	);

	// Initialize manager and connect
	useEffect(() => {
		const manager = new EventStreamManager<TOutput>({
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
