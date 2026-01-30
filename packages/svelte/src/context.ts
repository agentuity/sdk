import { defaultBaseUrl } from '@agentuity/frontend';
import { setGlobalBaseUrl, setGlobalAuthHeader } from './client';

export interface AgentuityContextValue {
	baseUrl: string;
	authHeader?: string | null;
}

/**
 * Initialize the Agentuity context for Svelte applications.
 * This sets up the global base URL and auth header for API clients.
 *
 * Call this function in your root layout or app initialization.
 *
 * @example
 * ```svelte
 * <script>
 *   import { initAgentuity } from '@agentuity/svelte';
 *   import { onMount } from 'svelte';
 *
 *   onMount(() => {
 *     initAgentuity({ baseUrl: 'http://localhost:3500' });
 *   });
 * </script>
 * ```
 */
export function initAgentuity(options?: { baseUrl?: string; authHeader?: string | null }): void {
	const resolvedBaseUrl = options?.baseUrl || defaultBaseUrl;
	setGlobalBaseUrl(resolvedBaseUrl);

	if (options?.authHeader !== undefined) {
		setGlobalAuthHeader(options.authHeader);
	}
}

/**
 * Update the auth header for API clients.
 * Call this when the user logs in or out.
 *
 * @example
 * ```typescript
 * import { setAuthHeader } from '@agentuity/svelte';
 *
 * // On login
 * setAuthHeader('Bearer token123');
 *
 * // On logout
 * setAuthHeader(null);
 * ```
 */
export function setAuthHeader(authHeader: string | null): void {
	setGlobalAuthHeader(authHeader);
}

/**
 * Update the base URL for API clients.
 *
 * @example
 * ```typescript
 * import { setBaseUrl } from '@agentuity/svelte';
 *
 * setBaseUrl('https://api.example.com');
 * ```
 */
export function setBaseUrl(baseUrl: string): void {
	setGlobalBaseUrl(baseUrl);
}
