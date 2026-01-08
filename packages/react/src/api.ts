/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { InferInput, InferOutput } from '@agentuity/core';
import { deserializeData, buildUrl } from '@agentuity/frontend';
import type { RouteRegistry } from './types';
import { AgentuityContext } from './context';

/**
 * Extract route keys from RouteRegistry (e.g., 'GET /users', 'POST /users')
 */
export type RouteKey = keyof RouteRegistry;

/**
 * Extract HTTP method from route key
 */
export type ExtractMethod<TRoute extends RouteKey> = TRoute extends `${infer Method} ${string}`
	? Method
	: never;

/**
 * Extract path from route key given a method
 * E.g., ExtractPath<'GET /users', 'GET'> = '/users'
 */
export type ExtractPath<TRoute extends RouteKey, M extends string> = TRoute extends `${M} ${infer Path}`
	? Path
	: never;

/**
 * Reconstruct the route key from method and path
 * This ensures proper type inference when using {method, path} form
 * E.g., RouteFromMethodPath<'GET', '/users'> = 'GET /users'
 */
export type RouteFromMethodPath<M extends string, P extends string> = Extract<RouteKey, `${M} ${P}`>;

/**
 * Check if a route is a streaming route
 */
export type RouteIsStream<TRoute extends RouteKey> = TRoute extends keyof RouteRegistry
	? RouteRegistry[TRoute] extends { stream: true }
		? true
		: false
	: false;

/**
 * Extract input type for a specific route
 */
export type RouteInput<TRoute extends RouteKey> = TRoute extends keyof RouteRegistry
	? RouteRegistry[TRoute] extends { inputSchema: any }
		? InferInput<RouteRegistry[TRoute]['inputSchema']>
		: never
	: never;

/**
 * Extract output type for a specific route
 * Returns void if no outputSchema is defined (e.g., 204 No Content)
 * For streaming routes, returns T[] (accumulated chunks)
 */
export type RouteOutput<TRoute extends RouteKey> = TRoute extends keyof RouteRegistry
	? RouteRegistry[TRoute] extends { outputSchema: infer TSchema; stream: true }
		? TSchema extends undefined | never
			? unknown[]
			: InferOutput<TSchema>[]
		: RouteRegistry[TRoute] extends { outputSchema: infer TSchema }
			? TSchema extends undefined | never
				? void
				: InferOutput<TSchema>
			: void
	: void;

/**
 * Helper to extract single chunk type from RouteOutput
 */
type RouteChunkType<TRoute extends RouteKey> = TRoute extends keyof RouteRegistry
	? RouteRegistry[TRoute] extends { outputSchema: infer TSchema }
		? TSchema extends undefined | never
			? unknown
			: InferOutput<TSchema>
		: unknown
	: unknown;

/**
 * Extract path params type for a specific route.
 * Returns the typed params object if the route has path parameters, otherwise never.
 */
export type RoutePathParams<TRoute extends RouteKey> = TRoute extends keyof RouteRegistry
	? RouteRegistry[TRoute] extends { params: infer P }
		? P
		: never
	: never;

/**
 * Base options shared by all UseAPI configurations (without params handling).
 * This is used as a foundation for both route-form and method/path-form options.
 */
type UseAPIBaseOptions<TRoute extends RouteKey> = {
	/** Additional query parameters */
	query?: URLSearchParams | Record<string, string>;
	/** Additional request headers */
	headers?: Record<string, string>;
	/** Whether to execute the request immediately on mount (default: true for GET, false for others) */
	enabled?: boolean;
	/** How long data stays fresh before refetching (ms, default: 0 - always stale) */
	staleTime?: number;
	/** Refetch interval in milliseconds (default: disabled) */
	refetchInterval?: number;
	/** Callback when request succeeds */
	onSuccess?: (data: RouteOutput<TRoute>) => void;
	/** Callback when request fails */
	onError?: (error: Error) => void;
} & (RouteIsStream<TRoute> extends true
	? {
			/** Delimiter for splitting stream chunks (default: \n for JSON lines) */
			delimiter?: string;
			/** Optional transform callback for each chunk */
			onChunk?: (
				chunk: RouteChunkType<TRoute>
			) => Promise<RouteChunkType<TRoute>> | RouteChunkType<TRoute>;
		}
	: // eslint-disable-next-line @typescript-eslint/no-empty-object-type
		{}) &
	(ExtractMethod<TRoute> extends 'GET'
		? {
				/** GET requests cannot have input (use query params instead) */
				input?: never;
			}
		: {
				/** Input data for the request (required for POST/PUT/PATCH/DELETE) */
				input?: RouteInput<TRoute>;
			});

/**
 * Options for the route form with strict params handling.
 * When TRoute is a single route key (not a union), this correctly requires
 * params only for routes that have path parameters.
 */
type UseAPIRouteFormOptions<TRoute extends RouteKey> = UseAPIBaseOptions<TRoute> &
	(RoutePathParams<TRoute> extends never
		? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
			{} // No params property - omit entirely for routes without path parameters
		: {
				/** Path parameters for routes with dynamic segments (e.g., { id: '123' } for /users/:id) */
				params: RoutePathParams<TRoute>;
			});

/**
 * Options for the method/path form with optional params.
 *
 * When using {method, path}, TRoute is inferred as a union of all matching routes,
 * which causes RoutePathParams<TRoute> to be a union of all params types.
 * This makes params incorrectly required even for routes without path parameters.
 *
 * To fix this (GitHub Issue #417), we make params optional in the method/path form.
 * Users who want strict params enforcement should use the route form instead.
 */
type UseAPIMethodPathFormOptions<TRoute extends RouteKey> = UseAPIBaseOptions<TRoute> & {
	/**
	 * Optional path parameters for dynamic segments when using method+path.
	 * These are optional because TRoute may be inferred as a union of routes.
	 * For strict params typing, use the route form: useAPI({ route: 'GET /users/:id', params: {...} })
	 */
	params?: RoutePathParams<TRoute> extends never ? never : RoutePathParams<TRoute>;
};

/**
 * Options with route property (e.g., { route: 'GET /users' })
 * Uses strict params handling - params required only for routes with path parameters.
 */
type UseAPIOptionsWithRoute<TRoute extends RouteKey> = UseAPIRouteFormOptions<TRoute> & {
	/** Route key (e.g., 'GET /users', 'POST /users') */
	route: TRoute;
	/** Method cannot be specified when using route */
	method?: never;
	/** Path cannot be specified when using route */
	path?: never;
};

/**
 * Options with method and path properties (e.g., { method: 'GET', path: '/users' })
 * Uses optional params handling to avoid false positives when TRoute is a union.
 *
 * Note: For full type safety with params, prefer using the route form:
 * useAPI({ route: 'GET /users/:id', params: { id: '123' } })
 */
type UseAPIOptionsWithMethodPath<TRoute extends RouteKey> = UseAPIMethodPathFormOptions<TRoute> & {
	/** HTTP method (e.g., 'GET', 'POST') */
	method: ExtractMethod<TRoute>;
	/** Request path (e.g., '/users') */
	path: string;
	/** Route cannot be specified when using method/path */
	route?: never;
};

/**
 * Options for useAPI hook with smart input typing based on HTTP method
 * Supports either route OR {method, path} but not both
 */
export type UseAPIOptions<TRoute extends RouteKey> =
	| UseAPIOptionsWithRoute<TRoute>
	| UseAPIOptionsWithMethodPath<TRoute>;

/**
 * Base return value from useAPI hook (without data property or execute)
 */
interface UseAPIResultBase {
	/** Error if request failed */
	error: Error | null;
	/** Whether request is currently in progress */
	isLoading: boolean;
	/** Whether request has completed successfully at least once */
	isSuccess: boolean;
	/** Whether request has failed */
	isError: boolean;
	/** Whether data is currently being fetched (including refetches) */
	isFetching: boolean;
	/** Reset state to initial values */
	reset: () => void;
}

/**
 * Return value for GET requests (auto-executing)
 */
type UseAPIResultQuery<TRoute extends RouteKey> = UseAPIResultBase &
	(RouteOutput<TRoute> extends void
		? {
				/** No data property - route returns no content (204 No Content) */
				data?: never;
				/** Manually trigger a refetch */
				refetch: () => Promise<void>;
			}
		: {
				/** Response data (undefined until loaded) */
				data: RouteOutput<TRoute> | undefined;
				/** Manually trigger a refetch */
				refetch: () => Promise<void>;
			});

/**
 * Return value for POST/PUT/PATCH/DELETE requests (manual execution)
 */
type UseAPIResultMutation<TRoute extends RouteKey> = UseAPIResultBase &
	(RouteOutput<TRoute> extends void
		? {
				/** No data property - route returns no content (204 No Content) */
				data?: never;
				/** Invoke the mutation with required input */
				invoke: RouteInput<TRoute> extends never
					? () => Promise<void>
					: (input: RouteInput<TRoute>) => Promise<void>;
			}
		: {
				/** Response data (undefined until invoked) */
				data: RouteOutput<TRoute> | undefined;
				/** Invoke the mutation with required input */
				invoke: RouteInput<TRoute> extends never
					? () => Promise<RouteOutput<TRoute>>
					: (input: RouteInput<TRoute>) => Promise<RouteOutput<TRoute>>;
			});

/**
 * Return value from useAPI hook
 * - GET requests: Auto-executes, returns refetch()
 * - POST/PUT/PATCH/DELETE: Manual execution, returns execute(input)
 */
export type UseAPIResult<TRoute extends RouteKey> =
	ExtractMethod<TRoute> extends 'GET' ? UseAPIResultQuery<TRoute> : UseAPIResultMutation<TRoute>;

/**
 * Parse route key into method and path
 */
function parseRouteKey(routeKey: string): { method: string; path: string } {
	const parts = routeKey.split(' ');
	if (parts.length !== 2) {
		throw new Error(`Invalid route key format: "${routeKey}". Expected "METHOD /path"`);
	}
	return { method: parts[0], path: parts[1] };
}

/**
 * Convert query object to URLSearchParams
 */
function toSearchParams(
	query?: URLSearchParams | Record<string, string>
): URLSearchParams | undefined {
	if (!query) return undefined;
	if (query instanceof URLSearchParams) return query;
	return new URLSearchParams(query);
}

/**
 * Substitute path parameters in a URL path template.
 * E.g., '/users/:id' with { id: '123' } becomes '/users/123'
 */
function substitutePathParams(pathTemplate: string, pathParams?: Record<string, string>): string {
	if (!pathParams) return pathTemplate;

	let result = pathTemplate;
	for (const [key, value] of Object.entries(pathParams)) {
		result = result.replace(new RegExp(`:${key}\\??`, 'g'), encodeURIComponent(value));
		result = result.replace(new RegExp(`\\*${key}`, 'g'), encodeURIComponent(value));
	}
	return result;
}

/**
 * Process ReadableStream with delimiter-based parsing
 */
async function processStream<T>(
	stream: ReadableStream<Uint8Array>,
	options: {
		delimiter: string;
		onChunk?: (chunk: T) => Promise<T> | T;
		onData: (chunk: T) => void;
		onError: (error: Error) => void;
		mountedRef: React.MutableRefObject<boolean>;
	}
): Promise<boolean> {
	const { delimiter, onChunk, onData, onError, mountedRef } = options;
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (!mountedRef.current) {
				reader.cancel();
				return false;
			}

			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			const parts = buffer.split(delimiter);
			buffer = parts.pop() || '';

			for (const part of parts) {
				if (!part.trim()) continue;

				try {
					// Try JSON parsing first, fall back to plain string for text streams
					let parsed: T;
					try {
						parsed = JSON.parse(part) as T;
					} catch {
						// Not valid JSON - treat as plain string
						parsed = part as T;
					}

					if (onChunk) {
						parsed = await Promise.resolve(onChunk(parsed));
					}

					if (!mountedRef.current) {
						reader.cancel();
						return false;
					}

					onData(parsed);
				} catch (err) {
					if (!mountedRef.current) {
						reader.cancel();
						return false;
					}

					const error = err instanceof Error ? err : new Error(String(err));
					onError(error);
					return false;
				}
			}
		}

		if (buffer.trim()) {
			try {
				// Try JSON parsing first, fall back to plain string for text streams
				let parsed: T;
				try {
					parsed = JSON.parse(buffer) as T;
				} catch {
					// Not valid JSON - treat as plain string
					parsed = buffer as T;
				}

				if (onChunk) {
					parsed = await Promise.resolve(onChunk(parsed));
				}

				if (mountedRef.current) {
					onData(parsed);
				}
			} catch (err) {
				if (!mountedRef.current) return false;

				const error = err instanceof Error ? err : new Error(String(err));
				onError(error);
				return false;
			}
		}
	} catch (err) {
		if (!mountedRef.current) return false;

		const error = err instanceof Error ? err : new Error(String(err));
		onError(error);
		return false;
	}

	return true;
}

/**
 * Type-safe API client hook with TanStack Query-inspired features.
 *
 * Provides automatic type inference for route inputs and outputs based on
 * the RouteRegistry generated from your routes.
 *
 * **Smart input typing:**
 * - GET requests: `input` is `never` (use `query` params instead)
 * - POST/PUT/PATCH/DELETE: `input` is properly typed from route schema
 *
 * @template TRoute - Route key from RouteRegistry (e.g., 'GET /users')
 *
 * @example Simple GET request with string
 * ```typescript
 * const { data, isLoading } = useAPI('GET /users');
 * ```
 *
 * @example GET request with route property
 * ```typescript
 * const { data, isLoading } = useAPI({
 *   route: 'GET /users',
 *   query: { search: 'alice' }, // ✅ Use query params for GET
 *   // input: { ... }, // ❌ TypeScript error - GET cannot have input!
 *   staleTime: 5000,
 * });
 * ```
 *
 * @example GET request with method and path
 * ```typescript
 * const { data, isLoading } = useAPI({
 *   method: 'GET',
 *   path: '/users',
 *   query: { search: 'alice' },
 * });
 * ```
 *
 * @example POST request with manual invocation
 * ```typescript
 * const { invoke, data, isLoading } = useAPI('POST /users');
 *
 * // Invoke manually with input
 * await invoke({ name: 'Alice', email: 'alice@example.com' }); // ✅ Fully typed!
 * // data now contains the created user
 * ```
 *
 * @example GET with query parameters
 * ```typescript
 * const { data } = useAPI({
 *   route: 'GET /search',
 *   query: { q: 'react', limit: '10' },
 * });
 * ```
 *
 * @example DELETE with no response body (204 No Content)
 * ```typescript
 * const { invoke, isSuccess } = useAPI('DELETE /users/:id');
 *
 * // Invoke when needed
 * await invoke({ reason: 'Account closed' });
 *
 * // result.data doesn't exist! ❌ TypeScript error
 * // Use isSuccess instead ✅
 * if (isSuccess) {
 *   console.log('User deleted');
 * }
 * ```
 */
// Overload 1: String route form - direct route key
export function useAPI<TRoute extends RouteKey>(route: TRoute): UseAPIResult<TRoute>;

// Overload 2: Object with route property - uses route key directly
export function useAPI<TRoute extends RouteKey>(
	options: UseAPIOptionsWithRoute<TRoute>
): UseAPIResult<TRoute>;

// Overload 3: Object with method and path - reconstructs route key from method+path
export function useAPI<M extends string, P extends string>(
	options: { method: M; path: P } & Omit<UseAPIMethodPathFormOptions<RouteFromMethodPath<M, P>>, 'method' | 'path'>
): UseAPIResult<RouteFromMethodPath<M, P>>;

// Implementation signature
export function useAPI(routeOrOptions: unknown): any {
	// Normalize to options object - use plain object type since we're in the implementation
	const options: Record<string, any> =
		typeof routeOrOptions === 'string'
			? { route: routeOrOptions }
			: (routeOrOptions as Record<string, any>);
	const context = useContext(AgentuityContext);
	const {
		input,
		query,
		headers,
		enabled,
		staleTime = 0,
		refetchInterval,
		onSuccess,
		onError,
	} = options;

	// Extract params safely
	const pathParams = 'params' in options ? options.params : undefined;

	const delimiter = 'delimiter' in options ? (options.delimiter ?? '\n') : '\n';
	const onChunk = 'onChunk' in options ? options.onChunk : undefined;

	if (!context) {
		throw new Error('useAPI must be used within AgentuityProvider');
	}

	// Extract method and path from either route OR {method, path}
	let method: string;
	let basePath: string;

	if ('route' in options && options.route) {
		const parsed = parseRouteKey(options.route as string);
		method = parsed.method;
		basePath = parsed.path;
	} else if ('method' in options && 'path' in options && options.method && options.path) {
		method = options.method;
		basePath = options.path;
	} else {
		throw new Error('useAPI requires either route OR {method, path}');
	}

	// Substitute path parameters
	const path = substitutePathParams(basePath, pathParams as Record<string, string> | undefined);

	const [data, setData] = useState<any>(undefined);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isFetching, setIsFetching] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [isError, setIsError] = useState(false);
	const lastFetchTimeRef = useRef<number>(0);

	// Track mounted state to prevent state updates after unmount
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Use refs to store latest delimiter/onChunk values to avoid stale closures
	// without causing infinite loops in useCallback dependencies
	const delimiterRef = useRef(delimiter);
	const onChunkRef = useRef(onChunk);

	useEffect(() => {
		delimiterRef.current = delimiter;
		onChunkRef.current = onChunk;
	});

	const fetchData = useCallback(async () => {
		if (!mountedRef.current) return;

		const now = Date.now();
		const lastFetchTime = lastFetchTimeRef.current;

		// Check if data is still fresh based on last fetch time
		const isFresh = staleTime > 0 && lastFetchTime !== 0 && now - lastFetchTime < staleTime;
		if (isFresh) {
			return;
		}

		setIsFetching(true);

		// isLoading = only for first load (or after reset)
		if (lastFetchTime === 0) {
			setIsLoading(true);
		}

		setError(null);
		setIsError(false);

		try {
			const url = buildUrl(context.baseUrl || '', path, undefined, toSearchParams(query));
			const requestInit: RequestInit = {
				method,
				headers: {
					'Content-Type': 'application/json',
					...(context.authHeader && { Authorization: context.authHeader }),
					...headers,
				},
			};

			// Add body for non-GET requests
			if (method !== 'GET' && input !== undefined) {
				requestInit.body = JSON.stringify(input);
			}

			const response = await fetch(url, requestInit);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			let responseData: any;

			// Handle 204 No Content - no response body expected
			if (response.status === 204) {
				responseData = undefined;
			} else {
				const contentType = response.headers.get('Content-Type') || '';

				if (
					contentType.includes('text/event-stream') ||
					contentType.includes('application/octet-stream')
				) {
					if (!response.body) {
						throw new Error('Response body is null for streaming response');
					}

					setData([] as any);

					// Track accumulated chunks locally to avoid stale closure
					const accumulatedChunks: any[] = [];

					const success = await processStream<any>(response.body, {
						delimiter: delimiterRef.current,
						onChunk: onChunkRef.current as any,
						onData: (chunk) => {
							if (!mountedRef.current) return;

							accumulatedChunks.push(chunk);
							setData([...accumulatedChunks] as any);
						},
						onError: (err) => {
							if (!mountedRef.current) return;
							setError(err);
							setIsError(true);
							onError?.(err);
						},
						mountedRef,
					});

					if (!mountedRef.current) return;

					if (success) {
						setIsSuccess(true);
						lastFetchTimeRef.current = Date.now();

						const finalData = accumulatedChunks as any;
						onSuccess?.(finalData);
					}
					return;
				} else if (contentType.includes('application/json')) {
					responseData = await response.json();
				} else {
					const text = await response.text();
					responseData = deserializeData<any>(text);
				}
			}

			if (!mountedRef.current) return;

			// Use JSON memoization to prevent re-renders when data hasn't changed
			setData((prev: any) => {
				const newData = responseData as any;
				if (prev !== undefined && JSON.stringify(prev) === JSON.stringify(newData)) {
					return prev;
				}
				return newData;
			});
			setIsSuccess(true);
			lastFetchTimeRef.current = Date.now();

			onSuccess?.(responseData as any);
		} catch (err) {
			if (!mountedRef.current) return;

			const error = err instanceof Error ? err : new Error(String(err));
			setError(error);
			setIsError(true);
			onError?.(error);
		} finally {
			if (mountedRef.current) {
				setIsLoading(false);
				setIsFetching(false);
			}
		}
	}, [
		context.baseUrl,
		context.authHeader,
		path,
		method,
		input,
		query,
		headers,
		staleTime,
		onSuccess,
		onError,
	]);

	const reset = useCallback(() => {
		setData(undefined);
		setError(null);
		setIsLoading(false);
		setIsFetching(false);
		setIsSuccess(false);
		setIsError(false);
		lastFetchTimeRef.current = 0;
	}, []);

	// For GET requests: auto-fetch and provide refetch
	if (method === 'GET') {
		const refetch = useCallback(async () => {
			await fetchData();
		}, [fetchData]);

		// Auto-fetch on mount if enabled (default: true for GET)
		const shouldAutoFetch = enabled ?? true;
		useEffect(() => {
			if (shouldAutoFetch) {
				fetchData();
			}
		}, [shouldAutoFetch, fetchData]);

		// Refetch interval
		useEffect(() => {
			if (!refetchInterval || refetchInterval <= 0) return;

			const interval = setInterval(() => {
				fetchData();
			}, refetchInterval);

			return () => clearInterval(interval);
		}, [refetchInterval, fetchData]);

		return {
			data,
			error,
			isLoading,
			isSuccess,
			isError,
			isFetching,
			refetch,
			reset,
		} as any;
	}

	// For POST/PUT/PATCH/DELETE: provide invoke method (manual invocation)
	const invoke = useCallback(
		async (invokeInput?: any) => {
			// Use invokeInput parameter if provided
			const effectiveInput = invokeInput !== undefined ? invokeInput : input;

			setIsFetching(true);
			setIsLoading(true);
			setError(null);
			setIsError(false);

			try {
				const url = buildUrl(context.baseUrl || '', path, undefined, toSearchParams(query));
				const requestInit: RequestInit = {
					method,
					headers: {
						'Content-Type': 'application/json',
						...(context.authHeader && { Authorization: context.authHeader }),
						...headers,
					},
				};

				if (effectiveInput !== undefined) {
					requestInit.body = JSON.stringify(effectiveInput);
				}

				const response = await fetch(url, requestInit);

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				let responseData: any;

				if (response.status === 204) {
					responseData = undefined;
				} else {
					const contentType = response.headers.get('Content-Type') || '';

					if (
						contentType.includes('text/event-stream') ||
						contentType.includes('application/octet-stream')
					) {
						if (!response.body) {
							throw new Error('Response body is null for streaming response');
						}

						setData([] as any);

						// Track accumulated chunks locally to avoid stale closure
						const accumulatedChunks: any[] = [];
						let streamError: any = undefined;

						const success = await processStream<any>(response.body, {
							delimiter: delimiterRef.current,
							onChunk: onChunkRef.current as any,
							onData: (chunk) => {
								if (!mountedRef.current) return;

								accumulatedChunks.push(chunk);
								setData([...accumulatedChunks] as any);
							},
							onError: (err) => {
								if (!mountedRef.current) return;
								streamError = err;
								setError(err);
								setIsError(true);
								onError?.(err);
							},
							mountedRef,
						});

						if (!mountedRef.current)
							return accumulatedChunks as any;

						if (!success && streamError) {
							throw streamError;
						}

						if (success) {
							setIsSuccess(true);
							lastFetchTimeRef.current = Date.now();

							const finalData = accumulatedChunks as any;
							onSuccess?.(finalData);
							return finalData;
						}

						return accumulatedChunks as any;
					} else if (contentType.includes('application/json')) {
						responseData = await response.json();
					} else {
						const text = await response.text();
						responseData = deserializeData<any>(text);
					}
				}

				if (!mountedRef.current) return responseData;

				setData(responseData as any);
				setIsSuccess(true);
				lastFetchTimeRef.current = Date.now();

				onSuccess?.(responseData as any);

				return responseData as any;
			} catch (err) {
				if (!mountedRef.current) throw err;

				const error = err instanceof Error ? err : new Error(String(err));
				setError(error);
				setIsError(true);
				onError?.(error);
				throw error;
			} finally {
				if (mountedRef.current) {
					setIsLoading(false);
					setIsFetching(false);
				}
			}
		},
		[context.baseUrl, context.authHeader, path, method, query, headers, input, onSuccess, onError]
	);

	return {
		data,
		error,
		isLoading,
		isSuccess,
		isError,
		isFetching,
		invoke,
		reset,
	} as any;
}
