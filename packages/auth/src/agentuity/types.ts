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
 * Canonical authenticated user type for Agentuity Auth.
 *
 * This is an alias for BetterAuth's `User` type and represents the shape of
 * the `user` object you receive from:
 *
 * - `AuthInterface#getUser()` / `c.var.auth.getUser()` on the server
 * - `c.var.user` in Hono route handlers
 * - React hooks and context (`useAuth().user`) in `@agentuity/auth/react`
 *
 * Common fields include:
 * - `id` – Stable user identifier
 * - `email` – Primary email address
 * - `name` – Display name
 * - `image` – Avatar URL (if configured)
 * - `createdAt` / `updatedAt` – Timestamps
 *
 * The exact fields are defined by BetterAuth and may be extended by plugins.
 *
 * @remarks
 * Prefer using this `AuthUser` alias instead of referring to BetterAuth's
 * `User` type directly so your code stays aligned with Agentuity's auth
 * abstractions.
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
 * Full authentication interface available on `c.var.auth` and `ctx.auth`.
 *
 * This is the primary interface you'll use to access authentication data
 * in your route handlers and agents. It provides:
 *
 * - User data via `getUser()`
 * - Organization helpers via `getOrg()`, `getOrgRole()`, `hasOrgRole()`
 * - API key helpers via `apiKey`, `hasPermission()`
 * - Token access via `getToken()`
 *
 * @example Route handler
 * ```typescript
 * app.get('/api/profile', async (c) => {
 *   const user = await c.var.auth.getUser();
 *   const org = await c.var.auth.getOrg();
 *   return c.json({ user, org });
 * });
 * ```
 *
 * @example Agent handler
 * ```typescript
 * handler: async (ctx, input) => {
 *   if (!ctx.auth) return { error: 'Unauthorized' };
 *   const user = await ctx.auth.getUser();
 *   return { message: `Hello, ${user.email}!` };
 * }
 * ```
 *
 * @typeParam TUser - User type (defaults to AuthUser)
 */
export type AuthInterface<TUser = AuthUser> = AgentuityAuth<TUser, AuthContext> &
	AuthOrgHelpers &
	AuthApiKeyHelpers;
