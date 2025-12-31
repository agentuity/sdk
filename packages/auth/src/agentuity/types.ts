/**
 * Auth types for @agentuity/auth.
 *
 * @module agentuity/types
 */

import type { Session as BetterAuthSession, User as BetterAuthUser } from 'better-auth';
import type { AgentuityAuth } from '../types';

// =============================================================================
// Canonical User/Session Types
// =============================================================================

/**
 * Auth user type.
 * Alias for BetterAuth's User type.
 */
export type AuthUser = BetterAuthUser;

/**
 * Auth session type.
 * Extends BetterAuth's Session with organization plugin fields.
 */
export type AuthSession = BetterAuthSession & {
	/** Active organization ID from the organization plugin */
	activeOrganizationId?: string;
};

/**
 * Auth context containing user, session, and org data.
 * This is the full auth context available on AgentContext.auth and c.var.auth.
 * Session may be null for API key authentication.
 */
export interface AuthContext<TUser = AuthUser, TSession = AuthSession | null> {
	user: TUser;
	session: TSession;
	org: AuthOrgContext | null;
}

/**
 * Organization context from the organization plugin.
 */
export interface AuthOrgContext {
	/** Organization ID */
	id: string;
	/** Organization slug (URL-friendly identifier) */
	slug?: string | null;
	/** Organization display name */
	name?: string | null;
	/** Member's role in this organization (e.g., 'owner', 'admin', 'member') */
	role?: string | null;
	/** Member ID for this user in this organization */
	memberId?: string | null;
	/** Organization metadata (if enabled) */
	metadata?: unknown;
}

// =============================================================================
// API Key Types
// =============================================================================

/**
 * API key permissions format.
 * Maps resource names to arrays of allowed actions.
 *
 * @example
 * ```typescript
 * const permissions: AuthApiKeyPermissions = {
 *   project: ['read', 'write'],
 *   user: ['read'],
 *   admin: ['*'], // wildcard - all actions
 * };
 * ```
 */
export type AuthApiKeyPermissions = Record<string, string[]>;

/**
 * API key context when request is authenticated via API key.
 */
export interface AuthApiKeyContext {
	/** API key ID */
	id: string;
	/** Display name of the API key */
	name?: string | null;
	/** Permissions associated with this API key */
	permissions: AuthApiKeyPermissions;
	/** User ID the API key belongs to */
	userId?: string | null;
}

/**
 * Authentication method used for the current request.
 */
export type AuthMethod = 'session' | 'api-key' | 'bearer';

// =============================================================================
// Extended Auth Interface
// =============================================================================

/**
 * Organization helpers available on the auth context.
 */
export interface AuthOrgHelpers {
	/** Active organization context if available, null otherwise */
	org: AuthOrgContext | null;

	/** Returns active org or null (never throws) */
	getOrg(): Promise<AuthOrgContext | null>;

	/** Convenience accessor for the member's role on the active org */
	getOrgRole(): Promise<string | null>;

	/** True if the current member's role is one of the provided roles */
	hasOrgRole(...roles: string[]): Promise<boolean>;
}

/**
 * API key helpers available on the auth context.
 */
export interface AuthApiKeyHelpers {
	/** How this request was authenticated */
	authMethod: AuthMethod;

	/** API key context when request is authenticated via API key, null otherwise */
	apiKey: AuthApiKeyContext | null;

	/**
	 * Check if the API key has the required permissions.
	 * All specified actions must be present for the resource.
	 * Supports '*' wildcard which matches any action.
	 *
	 * @param resource - The resource to check (e.g., 'project', 'user')
	 * @param actions - Actions required (e.g., 'read', 'write')
	 * @returns true if all actions are permitted, false otherwise
	 *
	 * @example
	 * ```typescript
	 * // Check for specific permission
	 * if (c.var.auth.hasPermission('project', 'write')) { ... }
	 *
	 * // Check for multiple permissions (all required)
	 * if (c.var.auth.hasPermission('project', 'read', 'write')) { ... }
	 * ```
	 */
	hasPermission(resource: string, ...actions: string[]): boolean;
}

/**
 * Full Auth interface available on Hono context (c.var.auth).
 * Extends the generic AgentuityAuth with org and API key helpers.
 */
export type AuthInterface<TUser = unknown> = AgentuityAuth<TUser, AuthContext> &
	AuthOrgHelpers &
	AuthApiKeyHelpers;
