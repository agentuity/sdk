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
 * Options object for endpoints with path params.
 * Used when the route has path parameters that need to be substituted.
 */
export interface EndpointOptionsWithPathParams<
	Input = unknown,
	PathParams = Record<string, string>,
	Query = Record<string, string>,
> {
	pathParams: PathParams;
	input?: Input;
	query?: Query;
}

/**
 * Options object for endpoints without path params (optional query support).
 */
export interface EndpointOptionsWithQuery<Input = unknown, Query = Record<string, string>> {
	input?: Input;
	query?: Query;
}

/**
 * API endpoint - callable function for regular HTTP calls.
 * - Without path params: accepts input directly OR options object with query
 * - With path params: requires options object with pathParams
 */
export type APIEndpoint<Input = unknown, Output = unknown, PathParams = never> =
	[PathParams] extends [never]
		? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => Promise<Output>
		: (options: EndpointOptionsWithPathParams<Input, PathParams>) => Promise<Output>;

/**
 * WebSocket endpoint - callable function that returns WebSocket client.
 */
export type WebSocketEndpoint<Input = unknown, _Output = unknown, PathParams = never> =
	[PathParams] extends [never]
		? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => WebSocketClient
		: (options: EndpointOptionsWithPathParams<Input, PathParams>) => WebSocketClient;

/**
 * Server-Sent Events endpoint - callable function that returns EventStream client.
 */
export type SSEEndpoint<Input = unknown, _Output = unknown, PathParams = never> =
	[PathParams] extends [never]
		? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => EventStreamClient
		: (options: EndpointOptionsWithPathParams<Input, PathParams>) => EventStreamClient;

/**
 * Streaming endpoint - callable function that returns Stream client.
 */
export type StreamEndpoint<Input = unknown, _Output = unknown, PathParams = never> =
	[PathParams] extends [never]
		? (inputOrOptions?: Input | EndpointOptionsWithQuery<Input>) => StreamClient
		: (options: EndpointOptionsWithPathParams<Input, PathParams>) => StreamClient;

/**
 * Route endpoint - discriminated union based on route type.
 */
export type RouteEndpoint<
	Input = unknown,
	Output = unknown,
	Type extends string = 'api',
	PathParams = never,
> = Type extends 'websocket'
	? WebSocketEndpoint<Input, Output, PathParams>
	: Type extends 'sse'
		? SSEEndpoint<Input, Output, PathParams>
		: Type extends 'stream'
			? StreamEndpoint<Input, Output, PathParams>
			: APIEndpoint<Input, Output, PathParams>;

/**
 * Recursively build the client proxy type from a RouteRegistry.
 */
export type Client<R> = {
	[K in keyof R]: R[K] extends {
		input: infer I;
		output: infer O;
		type: infer T;
		pathParams: infer P;
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
