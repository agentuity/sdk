/**
 * Core authentication types for Agentuity Auth.
 *
 * @module types
 */

/**
 * Generic authentication interface exposed on Hono context.
 *
 * This type is intentionally provider-agnostic. For AgentuityAuth-based
 * projects, prefer {@link AuthInterface} from `./agentuity/types`,
 * which binds:
 * - `TUser` to {@link AuthUser}
 * - `TRaw` to {@link AuthContext}
 *
 * @typeParam TUser - Domain user type (e.g. AuthUser in AgentuityAuth projects).
 * @typeParam TRaw - Underlying auth context (e.g. AuthContext, JWT payload, or session object).
 *
 * @see {@link AuthInterface} for the full AgentuityAuth-specific interface with org and API key helpers.
 */
export interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	/** Get the authenticated user, throws if not authenticated */
	getUser(): Promise<TUser>;

	/** Get the raw JWT token */
	getToken(): Promise<string | null>;

	/** Raw provider-specific auth object or auth context (e.g. AuthContext, JWT payload, session) */
	raw: TRaw;
}
