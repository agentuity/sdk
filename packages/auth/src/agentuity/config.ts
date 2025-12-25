/**
 * Agentuity BetterAuth configuration wrapper.
 *
 * Provides sensible defaults and wraps BetterAuth with Agentuity-specific helpers.
 *
 * @module agentuity/config
 */

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { organization } from 'better-auth/plugins/organization';
import { jwt } from 'better-auth/plugins/jwt';
import { bearer } from 'better-auth/plugins/bearer';

/**
 * Configuration options for Agentuity auth.
 * Extends BetterAuth options with Agentuity-specific settings.
 */
export interface AgentuityAuthOptions extends BetterAuthOptions {
	/**
	 * Skip default plugins (organization, jwt, bearer).
	 * Use this if you want full control over plugins.
	 */
	skipDefaultPlugins?: boolean;
}

/**
 * Default plugins included with Agentuity auth.
 */
export function getDefaultPlugins() {
	return [organization(), jwt(), bearer()];
}

/**
 * Create an Agentuity-configured BetterAuth instance.
 *
 * This wraps BetterAuth with sensible defaults for Agentuity projects:
 * - Organization plugin for multi-tenancy
 * - JWT plugin for token-based auth
 * - Bearer plugin for API auth
 *
 * @example
 * ```typescript
 * import { createAgentuityAuth } from '@agentuity/auth/agentuity';
 *
 * export const auth = createAgentuityAuth({
 *   database: { url: process.env.DATABASE_URL! },
 *   basePath: '/auth',
 * });
 * ```
 */
export function createAgentuityAuth<T extends AgentuityAuthOptions>(options: T) {
	const { skipDefaultPlugins, plugins = [], ...restOptions } = options;

	const defaultPlugins = skipDefaultPlugins ? [] : getDefaultPlugins();

	const authInstance = betterAuth({
		...restOptions,
		plugins: [...defaultPlugins, ...plugins],
	});

	return authInstance;
}

/**
 * Type helper to extract the auth instance type.
 */
export type AgentuityAuthInstance = ReturnType<typeof createAgentuityAuth>;

/**
 * Alias for createAgentuityAuth.
 *
 * @example
 * ```typescript
 * import { withAgentuityAuth } from '@agentuity/auth/agentuity';
 *
 * export const auth = withAgentuityAuth({
 *   database: pool,
 *   basePath: '/api/auth',
 * });
 * ```
 */
export const withAgentuityAuth = createAgentuityAuth;
