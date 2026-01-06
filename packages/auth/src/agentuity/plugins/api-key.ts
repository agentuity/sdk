/**
 * API Key plugin types for @agentuity/auth.
 *
 * Server-side API methods for API key management provided by BetterAuth's
 * API Key plugin. Enables programmatic access to your application.
 *
 * @see https://better-auth.com/docs/plugins/api-key
 * @module agentuity/plugins/api-key
 */

/**
 * API Key data returned from API calls.
 */
export interface ApiKey {
	id: string;
	name: string;
	key?: string;
	start?: string;
	userId?: string;
	expiresAt?: Date | null;
	createdAt: Date;
	permissions?: Record<string, string[]> | null;
	metadata?: Record<string, unknown> | null;
}

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
	 * Defaults to ['x-agentuity-auth-api-key', 'X-Agentuity-Auth-Api-Key'].
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
}

/**
 * Default API key plugin options.
 */
export const DEFAULT_API_KEY_OPTIONS: Required<ApiKeyPluginOptions> = {
	enabled: true,
	apiKeyHeaders: ['x-agentuity-auth-api-key', 'X-Agentuity-Auth-Api-Key'],
	enableSessionForAPIKeys: true,
	defaultPrefix: 'ag_',
	defaultKeyLength: 64,
	enableMetadata: true,
};

/**
 * Server-side API methods for API key management.
 *
 * These methods are added by the BetterAuth API Key plugin and provide
 * programmatic access to your application via API keys.
 *
 * @see https://better-auth.com/docs/plugins/api-key
 */
export interface ApiKeyApiMethods {
	/**
	 * Create a new API key.
	 *
	 * When using session headers, the key is created for the authenticated user.
	 * For server-side creation (without headers), pass `userId` explicitly.
	 *
	 * **Important:** The full API key is only returned once at creation time.
	 * Store it securely - it cannot be retrieved later.
	 */
	createApiKey: (params: {
		body: {
			name?: string;
			expiresIn?: number;
			prefix?: string;
			userId?: string;
			permissions?: Record<string, string[]>;
			remaining?: number;
			metadata?: Record<string, unknown>;
			refillAmount?: number;
			refillInterval?: number;
			rateLimitTimeWindow?: number;
			rateLimitMax?: number;
			rateLimitEnabled?: boolean;
		};
		headers?: Headers;
	}) => Promise<ApiKey>;

	/**
	 * List all API keys for the authenticated user.
	 *
	 * Note: The full key value is not returned - only the `start` prefix
	 * for identification purposes.
	 */
	listApiKeys: (params: { headers?: Headers }) => Promise<
		Array<{
			id: string;
			name: string;
			start: string;
			expiresAt?: Date | null;
			createdAt: Date;
		}>
	>;

	/**
	 * Delete an API key.
	 *
	 * The key is immediately revoked and can no longer be used for authentication.
	 */
	deleteApiKey: (params: {
		body: { keyId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	/**
	 * Verify an API key and get its metadata.
	 *
	 * Used internally by middleware, but can also be called directly
	 * for custom API key validation logic.
	 */
	verifyApiKey: (params: { body: { key: string }; headers?: Headers }) => Promise<{
		valid: boolean;
		error?: { message: string; code: string } | null;
		key?: {
			id: string;
			name: string;
			userId: string;
			permissions?: Record<string, string[]> | null;
		} | null;
	}>;
}
