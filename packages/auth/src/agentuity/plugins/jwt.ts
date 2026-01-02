/**
 * JWT plugin types for @agentuity/auth.
 *
 * Server-side API methods for JWT token management provided by BetterAuth's
 * JWT plugin. Enables token-based authentication.
 *
 * @see https://better-auth.com/docs/plugins/jwt
 * @module agentuity/plugins/jwt
 */

/**
 * Server-side API methods for JWT token management.
 *
 * These methods are added by the BetterAuth JWT plugin and provide
 * JWT token generation for authenticated users.
 *
 * @see https://better-auth.com/docs/plugins/jwt
 */
export interface JwtApiMethods {
	/**
	 * Get a JWT token for the authenticated user.
	 *
	 * The token can be used with the Bearer plugin for stateless
	 * authentication in subsequent requests.
	 *
	 * The JWKS endpoint for token verification is available at:
	 * `{baseURL}/api/auth/.well-known/jwks.json`
	 */
	getToken: (params: { headers?: Headers }) => Promise<{ token: string }>;
}
