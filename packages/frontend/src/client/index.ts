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
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Substitute path parameters in a URL path template.
 * E.g., '/api/users/:id' with { id: '123' } becomes '/api/users/123'
 */
function substitutePathParams(pathTemplate: string, pathParams?: Record<string, string>): string {
	if (!pathParams) return pathTemplate;

	let result = pathTemplate;
	for (const [key, value] of Object.entries(pathParams)) {
		const escapedKey = escapeRegExp(key);
		result = result.replace(new RegExp(`:${escapedKey}\\??`, 'g'), encodeURIComponent(value));
		result = result.replace(new RegExp(`\\*${escapedKey}`, 'g'), encodeURIComponent(value));
	}
	return result;
}

/**
 * Build URL with query params.
 */
function buildUrlWithQuery(baseUrl: string, path: string, query?: Record<string, string>): string {
	const url = `${baseUrl}${path}`;
	if (!query || Object.keys(query).length === 0) return url;

	const params = new URLSearchParams(query);
	return `${url}?${params.toString()}`;
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

				// Look up route metadata
				let routeType = 'api';
				let routePath: string | undefined;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let metaNode: any = metadata;

				if (isStreamMethod) {
					// Stream methods directly specify the route type
					if (method === 'websocket') routeType = 'websocket';
					else if (method === 'eventstream') routeType = 'sse';
					else if (method === 'stream') routeType = 'stream';
				}

				if (metadata) {
					for (const segment of pathSegments) {
						if (metaNode && typeof metaNode === 'object') {
							metaNode = metaNode[segment];
						}
					}
					if (metaNode && typeof metaNode === 'object' && metaNode[method]) {
						if (metaNode[method].type) {
							routeType = metaNode[method].type;
						}
						if (metaNode[method].path) {
							routePath = metaNode[method].path;
						}
					}
				}

				// Fallback URL path if no metadata
				const fallbackPath = '/api/' + pathSegments.join('/');

				return (...args: unknown[]) => {
					const resolvedBaseUrl = resolveBaseUrl(baseUrl);
					const resolvedHeaders = resolveHeaders(defaultHeaders);

					// Get path param names from metadata if available
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const pathParamNames: string[] | undefined = (metaNode as any)?.[method]?.pathParams;
					const hasPathParams = pathParamNames && pathParamNames.length > 0;

					let pathParams: Record<string, string> | undefined;
					let input: unknown;
					let query: Record<string, string> | undefined;

					if (hasPathParams) {
						// Route has path params - positional arguments API
						// Args are: param1, param2, ..., [options?]
						// Example: client.user.get('123', 12) or client.user.get('123', 12, { query: {...} })
						pathParams = {};

						for (let i = 0; i < pathParamNames.length; i++) {
							const arg = args[i];
							if (arg !== undefined) {
								pathParams[pathParamNames[i]] = String(arg);
							}
						}

						// Check if there's an options object after the path params
						const optionsArg = args[pathParamNames.length];
						if (optionsArg && typeof optionsArg === 'object') {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							const opts = optionsArg as any;
							input = opts.input;
							query = opts.query;
						}
					} else {
						// No path params - use existing behavior
						const options = args[0];
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const opts = options as any;
						const isOptionsObject =
							opts && typeof opts === 'object' && ('input' in opts || 'query' in opts);

						input = isOptionsObject ? opts.input : options;
						query = isOptionsObject ? opts.query : undefined;
					}

					// Substitute path params in the route path
					const basePath = routePath || fallbackPath;
					const urlPath = substitutePathParams(basePath, pathParams);

					// WebSocket endpoint
					if (routeType === 'websocket') {
						const wsBaseUrl = resolvedBaseUrl.replace(/^http/, 'ws');
						const wsUrl = buildUrlWithQuery(wsBaseUrl, urlPath, query);
						const ws = createWebSocketClient(wsUrl);
						if (input) {
							ws.on('open', () => ws.send(input));
						}
						return ws;
					}

					// SSE endpoint
					if (routeType === 'sse') {
						const sseUrl = buildUrlWithQuery(resolvedBaseUrl, urlPath, query);
						return createEventStreamClient(sseUrl, {
							withCredentials: Object.keys(resolvedHeaders).length > 0,
						});
					}

					// Stream endpoint
					if (routeType === 'stream') {
						const streamUrl = buildUrlWithQuery(resolvedBaseUrl, urlPath, query);
						return fetch(streamUrl, {
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
					const apiUrl = buildUrlWithQuery(resolvedBaseUrl, urlPath, query);
					return fetch(apiUrl, {
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
