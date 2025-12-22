import type { Client, ClientOptions } from './types';
import { createWebSocketClient } from './websocket';
import { createEventStreamClient } from './eventstream';
import { createStreamClient } from './stream';

/**
 * Default base URL (empty = relative URLs).
 */
const defaultBaseUrl = '';

/**
 * Resolve baseUrl - if it's a function, call it; otherwise return the string.
 */
function resolveBaseUrl(baseUrl: string | (() => string)): string {
	return typeof baseUrl === 'function' ? baseUrl() : baseUrl;
}

/**
 * Resolve headers - if it's a function, call it; otherwise return the object.
 */
function resolveHeaders(
	headers: Record<string, string> | (() => Record<string, string>)
): Record<string, string> {
	return typeof headers === 'function' ? headers() : headers;
}

/**
 * Create a type-safe API client from a RouteRegistry.
 *
 * Uses a Proxy to build up the path as you navigate the object,
 * then executes the request when you call a terminal method (.post(), .get(), .websocket(), etc.).
 *
 * @example
 * ```typescript
 * import { createClient } from '@agentuity/frontend';
 * import type { RPCRouteRegistry } from './generated/routes';
 *
 * const client = createClient<RPCRouteRegistry>();
 *
 * // Type-safe API call
 * const result = await client.hello.post({ name: 'World' });
 *
 * // WebSocket
 * const ws = client.chat.websocket();
 * ws.on('message', (msg) => console.log(msg));
 *
 * // Server-Sent Events
 * const es = client.events.eventstream();
 * es.on('message', (event) => console.log(event.data));
 *
 * // Streaming response
 * const stream = await client.data.stream({ query: 'foo' });
 * stream.on('chunk', (chunk) => console.log(chunk));
 * ```
 */
export function createClient<R>(options: ClientOptions = {}, metadata?: unknown): Client<R> {
	const { baseUrl = defaultBaseUrl, headers, contentType = 'application/json', signal } = options;

	// Default headers to empty object if not provided
	const defaultHeaders = headers || {};

	const handler: ProxyHandler<{ __path: string[]; __type?: string }> = {
		get(target, prop: string) {
			const currentPath = target.__path;
			const newPath = [...currentPath, prop];

			// Check if this is a terminal method
			const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
			const streamMethods = ['websocket', 'eventstream', 'stream'];
			const isHttpMethod = httpMethods.includes(prop);
			const isStreamMethod = streamMethods.includes(prop);
			const isTerminalMethod = isHttpMethod || isStreamMethod;

			// Terminal: method at the end (minimum 1 path segment required)
			// Examples: client.hello.post(), client.echo.websocket(), client.events.eventstream()
			if (isTerminalMethod && currentPath.length >= 1) {
				const method = prop;
				const pathSegments = currentPath;
				const urlPath = '/api/' + pathSegments.join('/');

				// Determine route type
				let routeType = 'api';
				if (isStreamMethod) {
					// Stream methods directly specify the route type
					if (method === 'websocket') routeType = 'websocket';
					else if (method === 'eventstream') routeType = 'sse';
					else if (method === 'stream') routeType = 'stream';
				} else if (metadata) {
					// Look up route type from metadata for HTTP methods
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					let metaNode: any = metadata;
					for (const segment of pathSegments) {
						if (metaNode && typeof metaNode === 'object') {
							metaNode = metaNode[segment];
						}
					}
					if (metaNode && typeof metaNode === 'object' && metaNode[method]?.type) {
						routeType = metaNode[method].type;
					}
				}

				return (input?: unknown) => {
					const resolvedBaseUrl = resolveBaseUrl(baseUrl);
					const resolvedHeaders = resolveHeaders(defaultHeaders);

					// WebSocket endpoint
					if (routeType === 'websocket') {
						const wsBaseUrl = resolvedBaseUrl.replace(/^http/, 'ws');
						const wsUrl = `${wsBaseUrl}${urlPath}`;
						const ws = createWebSocketClient(wsUrl);
						if (input) {
							ws.on('open', () => ws.send(input));
						}
						return ws;
					}

					// SSE endpoint
					if (routeType === 'sse') {
						const sseUrl = `${resolvedBaseUrl}${urlPath}`;
						// Note: Native EventSource doesn't support custom headers
						// For auth, use withCredentials or consider fetch-based alternatives like @microsoft/fetch-event-source
						return createEventStreamClient(sseUrl, {
							withCredentials: Object.keys(resolvedHeaders).length > 0,
						});
					}

					// Stream endpoint
					if (routeType === 'stream') {
						return fetch(`${resolvedBaseUrl}${urlPath}`, {
							method: method.toUpperCase(),
							headers: { 'Content-Type': contentType, ...resolvedHeaders },
							body: input ? JSON.stringify(input) : undefined,
							signal,
						}).then((res) => {
							if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
							return createStreamClient(res);
						});
					}

					// Regular API endpoint
					return fetch(`${resolvedBaseUrl}${urlPath}`, {
						method: method.toUpperCase(),
						headers: { 'Content-Type': contentType, ...resolvedHeaders },
						body: method.toUpperCase() !== 'GET' && input ? JSON.stringify(input) : undefined,
						signal,
					}).then(async (res) => {
						if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
						if (res.status === 204) return undefined;
						return res.json();
					});
				};
			}

			// Otherwise, return a new proxy with extended path
			return new Proxy({ __path: newPath }, handler);
		},
	};

	return new Proxy({ __path: [] }, handler) as unknown as Client<R>;
}

// Re-export types
export type {
	ClientOptions,
	Client,
	RouteEndpoint,
	WebSocketClient,
	EventStreamClient,
	StreamClient,
	EventHandler,
} from './types';
