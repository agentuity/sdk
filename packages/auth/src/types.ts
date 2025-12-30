/**
 * Core authentication types for Agentuity Auth.
 *
 * @module types
 */

/**
 * Authenticated user from Agentuity Auth.
 */
export interface AgentuityAuthUser<T = unknown> {
	/** Unique user identifier */
	id: string;

	/** User's full name */
	name?: string;

	/** Primary email address */
	email?: string;

	/** Whether email is verified */
	emailVerified?: boolean;

	/** User's profile image URL */
	image?: string;

	/** Raw provider-specific user object for advanced use cases */
	raw: T;
}

/**
 * Generic authentication interface exposed on Hono context.
 * Use the more specific AgentuityAuthContext for full functionality.
 */
export interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	/** Get the authenticated user, throws if not authenticated */
	getUser(): Promise<AgentuityAuthUser<TUser>>;

	/** Get the raw JWT token */
	getToken(): Promise<string | null>;

	/** Raw provider-specific auth object (e.g., JWT payload, session) */
	raw: TRaw;
}
