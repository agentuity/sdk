/**
 * Core authentication types shared across all providers.
 *
 * @module types
 */

/**
 * Generic authenticated user interface.
 * All auth providers return this structure with provider-specific data in `raw`.
 */
export interface AgentuityAuthUser<T = unknown> {
	/** Unique user identifier from the auth provider */
	id: string;

	/** User's full name */
	name?: string;

	/** Primary email address */
	email?: string;

	/** Raw provider-specific user object for advanced use cases */
	raw: T;
}

/**
 * Generic authentication interface exposed on Hono context.
 * All auth middleware implementations provide this interface.
 */
export interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	/** Get the authenticated user, throws if not authenticated */
	getUser(): Promise<AgentuityAuthUser<TUser>>;

	/** Get the raw JWT token */
	getToken(): Promise<string | null>;

	/** Raw provider-specific auth object (e.g., JWT payload, session) */
	raw: TRaw;
}
