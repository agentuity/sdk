/**
 * Type-safe API client types for RPC-style invocations.
 */

/**
 * Options for creating a client.
 */
export interface ClientOptions {
	/**
	 * Base URL for API requests (e.g., "https://p1234567890.agenuity.run").
	 * Defaults to empty string (relative URLs).
	 * Can be a string or a function that returns a string for lazy resolution.
	 */
	baseUrl?: string | (() => string);

	/**
	 * Default headers to include in all requests.
	 * Can be a static object or a function that returns headers for dynamic resolution (e.g., auth tokens).
	 */
	headers?: Record<string, string> | (() => Record<string, string>);

	/**
	 * Content-Type header for request bodies.
	 * @default "application/json"
	 */
	contentType?: string;

	/**
	 * AbortSignal for request cancellation.
	 */
	signal?: AbortSignal;
}

/**
 * Event handler for streaming responses.
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * WebSocket wrapper with event-based API.
 */
export interface WebSocketClient {
	/**
	 * Register an event handler.
	 */
	on: {
		(event: 'message', handler: EventHandler<unknown>): void;
		(event: 'open', handler: EventHandler<Event>): void;
		(event: 'close', handler: EventHandler<CloseEvent>): void;
		(event: 'error', handler: EventHandler<Event>): void;
	};

	/**
	 * Send data through the WebSocket.
	 */
	send(data: unknown): void;

	/**
	 * Close the WebSocket connection.
	 */
	close(code?: number, reason?: string): void;
}

/**
 * Server-Sent Events (SSE) client with event-based API.
 */
export interface EventStreamClient {
	/**
	 * Register an event handler.
	 */
	on: {
		(event: 'message', handler: EventHandler<MessageEvent>): void;
		(event: 'open', handler: EventHandler<Event>): void;
		(event: 'error', handler: EventHandler<Event>): void;
	};

	/**
	 * Close the EventSource connection.
	 */
	close(): void;
}

/**
 * Streaming response reader with event-based API.
 */
export interface StreamClient {
	/**
	 * Register an event handler.
	 */
	on: {
		(event: 'chunk', handler: EventHandler<Uint8Array>): void;
		(event: 'close', handler: EventHandler<void>): void;
		(event: 'error', handler: EventHandler<Error>): void;
	};

	/**
	 * Cancel the stream.
	 */
	cancel(): Promise<void>;
}

/**
 * Options object for endpoints without path params (optional query support).
 */
export interface EndpointOptionsWithQuery<Input = unknown, Query = Record<string, string>> {
	input?: Input;
	query?: Query;
}

/**
 * Additional options that can be passed after positional path params.
 */
export interface EndpointExtraOptions<Input = unknown, Query = Record<string, string>> {
	input?: Input;
	query?: Query;
}

/**
 * Convert a path params object to a tuple of its value types.
 * Used for positional argument typing.
 * Note: For proper ordering, we rely on the generated PathParamsTuple type.
 */
export type PathParamsToTuple<P> = P extends readonly [infer First, ...infer Rest]
	? [First, ...PathParamsToTuple<Rest>]
	: P extends readonly []
		? []
		: string[];

/**
 * API endpoint - callable function for regular HTTP calls.
 * - Without path params: accepts input directly OR options object with query
 * - With path params: accepts positional arguments followed by optional options object
 *
 * @example
 * // No path params
 * client.hello.post({ name: 'World' })
 *
 * // Single path param
 * client.users.userId.get('123')
 *
 * // Multiple path params
 * client.orgs.orgId.members.memberId.get('org-1', 'user-2')
 *
 * // With additional options
 * client.users.userId.get('123', { query: { include: 'posts' } })
 */
export type APIEndpoint<
	Input = unknown,
	Output = unknown,
	PathParams = never,
	PathParamsTuple extends unknown[] = string[],
> = [PathParams] extends [never]
	? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => Promise<Output>
	: (...args: [...PathParamsTuple, options?: EndpointExtraOptions<Input>]) => Promise<Output>;

/**
 * WebSocket endpoint - callable function that returns WebSocket client.
 */
export type WebSocketEndpoint<
	Input = unknown,
	_Output = unknown,
	PathParams = never,
	PathParamsTuple extends unknown[] = string[],
> = [PathParams] extends [never]
	? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => WebSocketClient
	: (...args: [...PathParamsTuple, options?: EndpointExtraOptions<Input>]) => WebSocketClient;

/**
 * Server-Sent Events endpoint - callable function that returns EventStream client.
 */
export type SSEEndpoint<
	Input = unknown,
	_Output = unknown,
	PathParams = never,
	PathParamsTuple extends unknown[] = string[],
> = [PathParams] extends [never]
	? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => EventStreamClient
	: (...args: [...PathParamsTuple, options?: EndpointExtraOptions<Input>]) => EventStreamClient;

/**
 * Streaming endpoint - callable function that returns Stream client.
 */
export type StreamEndpoint<
	Input = unknown,
	_Output = unknown,
	PathParams = never,
	PathParamsTuple extends unknown[] = string[],
> = [PathParams] extends [never]
	? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => StreamClient
	: (...args: [...PathParamsTuple, options?: EndpointExtraOptions<Input>]) => StreamClient;

/**
 * Route endpoint - discriminated union based on route type.
 */
export type RouteEndpoint<
	Input = unknown,
	Output = unknown,
	Type extends string = 'api',
	PathParams = never,
	PathParamsTuple extends unknown[] = [],
> = Type extends 'websocket'
	? WebSocketEndpoint<Input, Output, PathParams, PathParamsTuple>
	: Type extends 'sse'
		? SSEEndpoint<Input, Output, PathParams, PathParamsTuple>
		: Type extends 'stream'
			? StreamEndpoint<Input, Output, PathParams, PathParamsTuple>
			: APIEndpoint<Input, Output, PathParams, PathParamsTuple>;

/**
 * Recursively build the client proxy type from a RouteRegistry.
 */
export type Client<R> = {
	[K in keyof R]: R[K] extends {
		input: infer I;
		output: infer O;
		type: infer T;
		params: infer P;
		paramsTuple: infer PT;
	}
		? PT extends unknown[]
			? RouteEndpoint<I, O, T extends string ? T : 'api', P, PT>
			: RouteEndpoint<I, O, T extends string ? T : 'api', P>
		: R[K] extends {
					input: infer I;
					output: infer O;
					type: infer T;
					params: infer P;
			  }
			? RouteEndpoint<I, O, T extends string ? T : 'api', P>
			: R[K] extends { input: infer I; output: infer O; type: infer T }
				? RouteEndpoint<I, O, T extends string ? T : 'api'>
				: R[K] extends { input: infer I; output: infer O }
					? RouteEndpoint<I, O, 'api'>
					: R[K] extends object
						? Client<R[K]>
						: never;
};
