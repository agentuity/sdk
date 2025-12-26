/**
 * Agentuity KV adapter for BetterAuth API Key plugin.
 *
 * Provides a BetterAuth-compatible secondaryStorage implementation backed by
 * Agentuity's Key-Value storage service (Redis-based).
 *
 * @module agentuity/api-key-storage
 */

import type { KeyValueStorage } from '@agentuity/core';

/**
 * BetterAuth secondaryStorage interface.
 * This is what BetterAuth expects for custom storage backends.
 */
export interface BetterAuthSecondaryStorage {
	get: (key: string) => Promise<unknown> | unknown;
	set: (key: string, value: string, ttl?: number) => Promise<void | null | unknown> | void;
	delete: (key: string) => Promise<void | null | string> | void;
}

/**
 * Options for creating Agentuity API key storage adapter.
 */
export interface AgentuityApiKeyStorageOptions {
	/**
	 * Agentuity KeyValueStorage instance.
	 * Typically obtained from AgentContext.kv or created via KeyValueStorageService.
	 */
	kv: KeyValueStorage;

	/**
	 * Namespace for API key storage.
	 * Defaults to '_agentuity_auth_apikeys'.
	 */
	namespace?: string;

	/**
	 * Whether to auto-create the namespace if it doesn't exist.
	 * Defaults to true.
	 */
	autoCreateNamespace?: boolean;
}

/**
 * Default namespace for API key storage.
 */
export const AGENTUITY_API_KEY_NAMESPACE = '_agentuity_auth_apikeys';

/**
 * Minimum TTL in milliseconds that Agentuity KV supports (60 seconds).
 * BetterAuth passes TTL in milliseconds.
 */
const MIN_TTL_MS = 60_000;

/**
 * Create a BetterAuth-compatible secondaryStorage adapter backed by Agentuity KV.
 *
 * This adapter allows BetterAuth's API Key plugin to store keys in Agentuity's
 * Redis-based Key-Value storage instead of (or in addition to) the database.
 *
 * BetterAuth stores API keys using these key patterns:
 * - `api-key:${hashedKey}` - Primary lookup by hashed key
 * - `api-key:by-id:${id}` - Lookup by ID
 * - `api-key:by-user:${userId}` - User's API key list
 *
 * @example
 * ```typescript
 * import { createAgentuityApiKeyStorage } from '@agentuity/auth/agentuity';
 *
 * // In your auth.ts:
 * const storage = createAgentuityApiKeyStorage({ kv: ctx.kv });
 *
 * export const auth = createAgentuityAuth({
 *   database: pool,
 *   secondaryStorage: storage,
 *   // API key plugin will use this storage
 * });
 * ```
 */
export function createAgentuityApiKeyStorage(
	options: AgentuityApiKeyStorageOptions
): BetterAuthSecondaryStorage {
	const { kv, namespace = AGENTUITY_API_KEY_NAMESPACE, autoCreateNamespace = true } = options;

	let namespaceEnsured = false;

	async function ensureNamespace(): Promise<void> {
		if (namespaceEnsured) return;

		if (autoCreateNamespace) {
			try {
				await kv.createNamespace(namespace);
			} catch {
				// Namespace may already exist, ignore error
			}
		}
		namespaceEnsured = true;
	}

	return {
		async get(key: string): Promise<unknown> {
			await ensureNamespace();

			try {
				const result = await kv.get(namespace, key);
				if (!result.exists) {
					return null;
				}
				// BetterAuth expects the raw value (usually a JSON string)
				return result.data;
			} catch (error) {
				console.error('[AgentuityApiKeyStorage] get error:', error);
				return null;
			}
		},

		async set(key: string, value: string, ttl?: number): Promise<void> {
			await ensureNamespace();

			try {
				// Agentuity KV requires TTL >= 60 seconds (60000ms)
				// BetterAuth passes TTL in milliseconds
				let kvTtl: number | undefined;
				if (ttl !== undefined && ttl > 0) {
					// Ensure minimum TTL of 60 seconds
					kvTtl = Math.max(ttl, MIN_TTL_MS);
				}

				await kv.set(namespace, key, value, { ttl: kvTtl });
			} catch (error) {
				console.error('[AgentuityApiKeyStorage] set error:', error);
				throw error;
			}
		},

		async delete(key: string): Promise<void> {
			await ensureNamespace();

			try {
				await kv.delete(namespace, key);
			} catch (error) {
				console.error('[AgentuityApiKeyStorage] delete error:', error);
				// Don't throw on delete errors - key may not exist
			}
		},
	};
}

/**
 * Type helper for BetterAuth secondary storage configuration.
 */
export type AgentuityApiKeyStorage = ReturnType<typeof createAgentuityApiKeyStorage>;
