/**
 * Core authentication types for Agentuity Auth.
 *
 * @module types
 */

/**
 * Generic authentication interface exposed on Hono context.
 * Use the more specific AgentuityAuthContext for full functionality.
 */
export interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	/** Get the authenticated user, throws if not authenticated */
	getUser(): Promise<TUser>;

	/** Get the raw JWT token */
	getToken(): Promise<string | null>;

	/** Raw provider-specific auth object (e.g., JWT payload, session) */
	raw: TRaw;
}
