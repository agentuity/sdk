/**
 * Agentuity BetterAuth configuration wrapper.
 *
 * Provides sensible defaults and wraps BetterAuth with Agentuity-specific helpers.
 *
 * @module agentuity/config
 */

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { organization, jwt, bearer, apiKey } from 'better-auth/plugins';
import type { BetterAuthSecondaryStorage } from './api-key-storage';

/**
 * API Key plugin configuration options.
 */
export interface ApiKeyPluginOptions {
	/**
	 * Whether to enable API key authentication.
	 * Defaults to true.
	 */
	enabled?: boolean;

	/**
	 * Header names to check for API key.
	 * Defaults to ['x-api-key', 'X-API-KEY'].
	 */
	apiKeyHeaders?: string[];

	/**
	 * Whether API keys should create mock sessions for the user.
	 * This allows API key auth to work seamlessly with session-based middleware.
	 * Defaults to true.
	 */
	enableSessionForAPIKeys?: boolean;

	/**
	 * Default prefix for generated API keys.
	 * Defaults to 'ag_'.
	 */
	defaultPrefix?: string;

	/**
	 * Default length for generated API keys (excluding prefix).
	 * Defaults to 64.
	 */
	defaultKeyLength?: number;

	/**
	 * Whether to enable metadata storage on API keys.
	 * Defaults to true.
	 */
	enableMetadata?: boolean;

	/**
	 * Storage mode for API keys.
	 * - 'secondary-storage': Store in secondaryStorage (e.g., KV) with database fallback (default)
	 * - 'database': Store only in database
	 * Defaults to 'secondary-storage'.
	 */
	storage?: 'database' | 'secondary-storage';

	/**
	 * When storage is 'secondary-storage', whether to fall back to database if key not found.
	 * Defaults to true.
	 */
	fallbackToDatabase?: boolean;
}

/**
 * Configuration options for Agentuity auth.
 * Extends BetterAuth options with Agentuity-specific settings.
 */
export interface AgentuityAuthOptions extends BetterAuthOptions {
	/**
	 * Skip default plugins (organization, jwt, bearer, apiKey).
	 * Use this if you want full control over plugins.
	 */
	skipDefaultPlugins?: boolean;

	/**
	 * API Key plugin configuration.
	 * Set to false to disable the API key plugin entirely.
	 */
	apiKey?: ApiKeyPluginOptions | false;

	/**
	 * Secondary storage for API keys (e.g., Agentuity KV).
	 * If provided, API keys can be stored/cached in this storage.
	 *
	 * @example
	 * ```typescript
	 * import { createAgentuityApiKeyStorage } from '@agentuity/auth/agentuity';
	 *
	 * const auth = createAgentuityAuth({
	 *   database: pool,
	 *   secondaryStorage: createAgentuityApiKeyStorage({ kv }),
	 * });
	 * ```
	 */
	secondaryStorage?: BetterAuthSecondaryStorage;
}

/**
 * Default API key plugin options.
 */
export const DEFAULT_API_KEY_OPTIONS: Required<ApiKeyPluginOptions> = {
	enabled: true,
	apiKeyHeaders: ['x-api-key', 'X-API-KEY'],
	enableSessionForAPIKeys: true,
	defaultPrefix: 'ag_',
	defaultKeyLength: 64,
	enableMetadata: true,
	storage: 'database', // Default to database - use 'secondary-storage' when KV is available
	fallbackToDatabase: true,
};

/**
 * Default plugins included with Agentuity auth.
 *
 * @param apiKeyOptions - API key plugin options, or false to disable
 */
export function getDefaultPlugins(apiKeyOptions?: ApiKeyPluginOptions | false) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const plugins: any[] = [organization(), jwt(), bearer()];

	// Add API key plugin unless explicitly disabled
	if (apiKeyOptions !== false) {
		const opts = { ...DEFAULT_API_KEY_OPTIONS, ...apiKeyOptions };

		if (opts.enabled) {
			plugins.push(
				apiKey({
					apiKeyHeaders: opts.apiKeyHeaders,
					enableSessionForAPIKeys: opts.enableSessionForAPIKeys,
					defaultPrefix: opts.defaultPrefix,
					defaultKeyLength: opts.defaultKeyLength,
					enableMetadata: opts.enableMetadata,
					storage: opts.storage,
					fallbackToDatabase: opts.fallbackToDatabase,
				})
			);
		}
	}

	return plugins;
}

/**
 * Create an Agentuity-configured BetterAuth instance.
 *
 * This wraps BetterAuth with sensible defaults for Agentuity projects:
 * - Organization plugin for multi-tenancy
 * - JWT plugin for token-based auth
 * - Bearer plugin for API auth
 * - API Key plugin for programmatic access (with enableSessionForAPIKeys)
 *
 * @example Basic usage with KV storage (recommended)
 * ```typescript
 * import { createAgentuityAuth, createAgentuityApiKeyStorage } from '@agentuity/auth/agentuity';
 *
 * export const auth = createAgentuityAuth({
 *   database: pool,
 *   basePath: '/api/auth',
 *   secondaryStorage: createAgentuityApiKeyStorage({ kv }),
 * });
 * ```
 *
 * @example Database-only storage (no KV)
 * ```typescript
 * import { createAgentuityAuth } from '@agentuity/auth/agentuity';
 *
 * export const auth = createAgentuityAuth({
 *   database: pool,
 *   basePath: '/api/auth',
 *   apiKey: {
 *     storage: 'database',
 *   },
 * });
 * ```
 */
export function createAgentuityAuth<T extends AgentuityAuthOptions>(options: T) {
	const {
		skipDefaultPlugins,
		plugins = [],
		apiKey: apiKeyOptions,
		secondaryStorage,
		...restOptions
	} = options;

	const defaultPlugins = skipDefaultPlugins ? [] : getDefaultPlugins(apiKeyOptions);

	const authInstance = betterAuth({
		...restOptions,
		secondaryStorage,
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
