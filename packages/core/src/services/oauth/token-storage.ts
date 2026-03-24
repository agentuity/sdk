import type { KeyValueStorage } from '../keyvalue/service.ts';
import type { OAuthFlowConfig, OAuthTokenResponse, StoredToken } from './types.ts';
import { StoredTokenSchema } from './types.ts';
import { refreshToken, logout } from './flow.ts';

const DEFAULT_NAMESPACE = 'oauth-tokens';

/**
 * Check whether a stored token's access token has expired.
 *
 * @param token - The stored token to check
 * @returns true if the token has an expires_at timestamp that is in the past
 *
 * @example
 * ```typescript
 * const token = await storage.get('user:123');
 * if (token && isTokenExpired(token)) {
 *   // Token is expired and auto-refresh wasn't available
 * }
 * ```
 */
export function isTokenExpired(token: StoredToken): boolean {
	if (!token.expires_at) return false;
	return Math.floor(Date.now() / 1000) >= token.expires_at;
}

/**
 * Options for configuring a TokenStorage instance.
 */
export interface TokenStorageOptions {
	/**
	 * OAuth configuration for auto-refresh and token revocation.
	 * If not provided, auto-refresh on get() and server-side revocation on invalidate() are disabled.
	 */
	config?: OAuthFlowConfig;

	/**
	 * KV namespace for storing tokens. Defaults to 'oauth-tokens'.
	 */
	namespace?: string;

	/**
	 * Key prefix prepended to all storage keys.
	 * Useful for scoping tokens by application or tenant.
	 */
	prefix?: string;
}

/**
 * Interface for storing, retrieving, and invalidating OAuth tokens.
 *
 * Implementations handle persistence and may support automatic token refresh
 * on retrieval and server-side revocation on invalidation.
 */
export interface TokenStorage {
	/**
	 * Retrieve a stored token by key.
	 *
	 * If the token is expired and a refresh_token is available (and config is provided),
	 * the token is automatically refreshed, stored, and the new token is returned.
	 * If auto-refresh fails, the expired token is returned so the caller can decide
	 * how to handle it (check with {@link isTokenExpired}).
	 *
	 * @param key - The storage key (e.g. a user ID or session ID)
	 * @returns The stored token, or null if no token exists for the key
	 */
	get(key: string): Promise<StoredToken | null>;

	/**
	 * Store a token response from a token exchange or refresh.
	 *
	 * Automatically computes `expires_at` from `expires_in` if present.
	 *
	 * @param key - The storage key (e.g. a user ID or session ID)
	 * @param token - The OAuth token response to store
	 */
	set(key: string, token: OAuthTokenResponse): Promise<void>;

	/**
	 * Invalidate a stored token: revoke it server-side and remove from storage.
	 *
	 * If config is provided, the refresh token (or access token as fallback)
	 * is revoked via the token revocation endpoint. Revocation is best-effort —
	 * the token is removed from storage regardless of whether revocation succeeds.
	 *
	 * @param key - The storage key to invalidate
	 * @returns The token that was removed, or null if no token existed
	 */
	invalidate(key: string): Promise<StoredToken | null>;
}

/**
 * Convert an OAuth token response to a StoredToken with computed expires_at.
 */
function toStoredToken(token: OAuthTokenResponse): StoredToken {
	return {
		access_token: token.access_token,
		token_type: token.token_type,
		refresh_token: token.refresh_token,
		scope: token.scope,
		id_token: token.id_token,
		expires_at: token.expires_in ? Math.floor(Date.now() / 1000) + token.expires_in : undefined,
	};
}

/**
 * Token storage backed by Agentuity's Key-Value storage service.
 *
 * Stores tokens as JSON in a KV namespace. Supports automatic token refresh
 * on retrieval when tokens expire (if OAuth config is provided).
 *
 * @example
 * ```typescript
 * import { KeyValueTokenStorage } from '@agentuity/core/oauth';
 *
 * // Create storage with auto-refresh enabled
 * const storage = new KeyValueTokenStorage(ctx.kv, {
 *   config: { issuer: 'https://auth.example.com' },
 * });
 *
 * // Store a token after initial exchange
 * await storage.set('user:123', tokenResponse);
 *
 * // Retrieve — auto-refreshes if expired
 * const token = await storage.get('user:123');
 *
 * // Logout — revokes server-side and removes from storage
 * await storage.invalidate('user:123');
 * ```
 */
export class KeyValueTokenStorage implements TokenStorage {
	#kv: KeyValueStorage;
	#namespace: string;
	#prefix: string;
	#config?: OAuthFlowConfig;

	constructor(kv: KeyValueStorage, options?: TokenStorageOptions) {
		this.#kv = kv;
		this.#namespace = options?.namespace ?? DEFAULT_NAMESPACE;
		this.#prefix = options?.prefix ?? '';
		this.#config = options?.config;
	}

	async get(key: string): Promise<StoredToken | null> {
		const result = await this.#kv.get<StoredToken>(this.#namespace, this.#resolveKey(key));
		if (!result.exists) return null;

		const parsed = StoredTokenSchema.safeParse(result.data);
		if (!parsed.success) return null;

		const token = parsed.data;

		// Auto-refresh if expired and refresh_token + config are available
		if (isTokenExpired(token) && token.refresh_token && this.#config) {
			try {
				const newTokenResponse = await refreshToken(token.refresh_token, this.#config);
				const newStored = toStoredToken(newTokenResponse);
				await this.#store(key, newStored);
				return newStored;
			} catch {
				// Refresh failed — return the expired token, caller can check isTokenExpired()
				return token;
			}
		}

		return token;
	}

	async set(key: string, token: OAuthTokenResponse): Promise<void> {
		const stored = toStoredToken(token);
		await this.#store(key, stored);
	}

	async invalidate(key: string): Promise<StoredToken | null> {
		const resolvedKey = this.#resolveKey(key);
		const result = await this.#kv.get<StoredToken>(this.#namespace, resolvedKey);

		if (!result.exists) return null;

		const parsed = StoredTokenSchema.safeParse(result.data);
		const token = parsed.success ? parsed.data : null;

		// Revoke server-side (best effort)
		if (token && this.#config) {
			const tokenToRevoke = token.refresh_token ?? token.access_token;
			try {
				await logout(tokenToRevoke, this.#config);
			} catch {
				// Best effort — continue with storage cleanup
			}
		}

		// Remove from storage regardless of revocation result
		await this.#kv.delete(this.#namespace, resolvedKey);

		return token;
	}

	async #store(key: string, token: StoredToken): Promise<void> {
		// Only set explicit TTL for tokens without a refresh_token.
		// Tokens with refresh capability persist until explicitly invalidated
		// (auto-refresh on get() will keep them fresh).
		let ttl: number | undefined;
		if (!token.refresh_token && token.expires_at) {
			const remaining = token.expires_at - Math.floor(Date.now() / 1000);
			if (remaining > 0) {
				ttl = Math.max(remaining, 60); // KV minimum is 60 seconds
			}
		}

		await this.#kv.set(this.#namespace, this.#resolveKey(key), token, {
			ttl,
			contentType: 'application/json',
		});
	}

	#resolveKey(key: string): string {
		return this.#prefix ? `${this.#prefix}${key}` : key;
	}
}
