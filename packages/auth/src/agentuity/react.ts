/**
 * Agentuity BetterAuth React client factory.
 *
 * Provides a pre-configured BetterAuth React client with sensible defaults.
 *
 * @module agentuity/react-client
 */

import { createAuthClient } from 'better-auth/react';

/**
 * Options for creating the Agentuity auth client.
 */
export interface AgentuityAuthClientOptions {
	/**
	 * Base URL for auth API requests.
	 * Defaults to `window.location.origin` in browser environments.
	 */
	baseURL?: string;

	/**
	 * Base path for BetterAuth endpoints.
	 * Defaults to '/api/auth' (Agentuity convention).
	 */
	basePath?: string;
}

/**
 * Create a pre-configured BetterAuth React client.
 *
 * This factory provides sensible defaults for Agentuity projects:
 * - Uses `/api/auth` as the default base path
 * - Automatically uses `window.location.origin` as base URL in browsers
 *
 * @example Basic usage (zero config)
 * ```typescript
 * import { createAgentuityAuthClient } from '@agentuity/auth/agentuity';
 *
 * export const authClient = createAgentuityAuthClient();
 * export const { signIn, signUp, signOut, useSession, getSession } = authClient;
 * ```
 *
 * @example With custom base path
 * ```typescript
 * export const authClient = createAgentuityAuthClient({
 *   basePath: '/auth', // If mounted at /auth instead of /api/auth
 * });
 * ```
 *
 * @example With explicit base URL (for SSR or testing)
 * ```typescript
 * export const authClient = createAgentuityAuthClient({
 *   baseURL: 'https://api.example.com',
 *   basePath: '/api/auth',
 * });
 * ```
 */
export function createAgentuityAuthClient(options: AgentuityAuthClientOptions = {}) {
	const baseURL = options.baseURL ?? (typeof window !== 'undefined' ? window.location.origin : '');
	const basePath = options.basePath ?? '/api/auth';

	return createAuthClient({
		baseURL,
		basePath,
	});
}

/**
 * Type helper for the auth client return type.
 */
export type AgentuityAuthClient = ReturnType<typeof createAgentuityAuthClient>;
