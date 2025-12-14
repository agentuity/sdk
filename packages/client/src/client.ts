import type { Client, ClientOptions } from './types';
import { defaultBaseUrl } from './url';

/**
 * Create a type-safe API client from a RouteRegistry.
 *
 * Uses a Proxy to build up the path as you navigate the object,
 * then executes the request when you call `.call(input)`.
 *
 * @example
 * ```typescript
 * import type { RouteRegistry } from './_generated/routes.generated';
 *
 * const client = createClient<RouteRegistry>();
 *
 * // Type-safe API call
 * const result = await client.post.api.hello.call({ name: 'World' });
 * ```
 */
export function createClient<R>(options: ClientOptions = {}): Client<R> {
	const { baseUrl = defaultBaseUrl, headers = {} } = options;

	const handler: ProxyHandler<{ __path: string[] }> = {
		get(target, prop: string) {
			const currentPath = target.__path;
			const newPath = [...currentPath, prop];

			// If accessing 'call', execute the request
			if (prop === 'call') {
				// First segment is method, rest is the URL path
				const [method, ...pathSegments] = currentPath;
				const urlPath = '/' + pathSegments.join('/');

				return async (input?: unknown) => {
					const url = `${baseUrl}${urlPath}`;
					const requestInit: RequestInit = {
						method: method.toUpperCase(),
						headers: {
							'Content-Type': 'application/json',
							...headers,
						},
					};

					// GET requests: no body
					// Other methods: JSON body if input provided
					if (method.toUpperCase() !== 'GET' && input !== undefined) {
						requestInit.body = JSON.stringify(input);
					}

					const response = await fetch(url, requestInit);

					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${response.statusText}`);
					}

					// Handle 204 No Content
					if (response.status === 204) {
						return undefined;
					}

					return response.json();
				};
			}

			// If accessing 'stream', return no-op for now
			if (prop === 'stream') {
				return () => {
					// no-op placeholder for streaming support
				};
			}

			// Otherwise, return a new proxy with extended path
			return new Proxy({ __path: newPath }, handler);
		},
	};

	return new Proxy({ __path: [] }, handler) as unknown as Client<R>;
}
