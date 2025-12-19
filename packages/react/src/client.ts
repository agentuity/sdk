import {
	createClient as coreCreateClient,
	type Client,
	type ClientOptions,
} from '@agentuity/frontend';

let globalBaseUrl: string | undefined;
let globalAuthHeader: string | null | undefined;

/**
 * Set the global base URL for RPC clients.
 * This is automatically called by AgentuityProvider.
 * @internal
 */
export function setGlobalBaseUrl(url: string): void {
	globalBaseUrl = url;
}

/**
 * Get the global base URL for RPC clients.
 * Returns the configured base URL or falls back to window.location.origin.
 * @internal
 */
export function getGlobalBaseUrl(): string {
	return globalBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
}

/**
 * Set the global auth header for RPC clients.
 * This is automatically called by AgentuityProvider when auth state changes.
 * @internal
 */
export function setGlobalAuthHeader(authHeader: string | null): void {
	globalAuthHeader = authHeader;
}

/**
 * Get the global auth header for RPC clients.
 * Returns the current auth header or undefined if not set.
 * @internal
 */
export function getGlobalAuthHeader(): string | null | undefined {
	return globalAuthHeader;
}

/**
 * Create a type-safe RPC client for React applications.
 *
 * This is a React-specific wrapper around @agentuity/core's createClient that
 * automatically uses the baseUrl and auth headers from AgentuityProvider context.
 *
 * @example
 * ```typescript
 * import { createClient } from '@agentuity/react';
 * import type { RPCRouteRegistry } from '@agentuity/react';
 *
 * const client = createClient<RPCRouteRegistry>();
 *
 * // Inside component
 * const result = await client.hello.post({ name: 'World' });
 * ```
 */
export function createClient<R>(
	options?: Omit<ClientOptions, 'baseUrl' | 'headers'> & {
		baseUrl?: string | (() => string);
		headers?: Record<string, string> | (() => Record<string, string>);
	},
	metadata?: unknown
): Client<R> {
	// Merge user headers with auth headers
	// User-provided headers take precedence over global auth header
	const mergedHeaders = (): Record<string, string> => {
		const authHeader = getGlobalAuthHeader();
		const userHeaders =
			typeof options?.headers === 'function' ? options.headers() : options?.headers || {};

		const headers: Record<string, string> = {};

		// Add global auth header first (lower priority)
		if (authHeader) {
			headers.Authorization = authHeader;
		}

		// User headers override global auth
		return { ...headers, ...userHeaders };
	};

	return coreCreateClient<R>(
		{
			...options,
			baseUrl: (options?.baseUrl || getGlobalBaseUrl) as string | (() => string),
			headers: mergedHeaders,
		} as ClientOptions,
		metadata
	);
}

/**
 * Create a type-safe API client with optional configuration.
 *
 * This is the recommended way to create an API client in React applications.
 * It automatically includes auth headers from AgentuityProvider and allows
 * custom headers to be passed.
 *
 * @example
 * ```typescript
 * import { createAPIClient } from '@agentuity/react';
 *
 * // Without custom options
 * const api = createAPIClient();
 * await api.hello.post({ name: 'World' });
 *
 * // With custom headers
 * const api = createAPIClient({ headers: { 'X-Custom': 'value' } });
 * await api.hello.post({ name: 'World' });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAPIClient<R = any>(
	options?: Omit<ClientOptions, 'baseUrl' | 'headers'> & {
		baseUrl?: string | (() => string);
		headers?: Record<string, string> | (() => Record<string, string>);
	}
): Client<R> {
	// This function is designed to be used with generated metadata
	// The metadata will be provided by the code generator
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createClient<R>(options, (globalThis as any).__rpcRouteMetadata);
}
