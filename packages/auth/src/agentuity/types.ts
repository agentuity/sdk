/**
 * Agentuity BetterAuth integration types.
 *
 * @module agentuity/types
 */

import type { Session, User } from 'better-auth';
import type { AgentuityAuth } from '../types';

/**
 * BetterAuth context containing user, session, and org data.
 * This is the raw auth context from BetterAuth's session validation.
 */
export interface AgentuityAuthContext<TUser = User, TSession = Session> {
	user: TUser;
	session: TSession;
	org: AgentuityOrgContext | null;
}

/**
 * Organization context derived from BetterAuth's organization plugin.
 */
export interface AgentuityOrgContext {
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
 * API key permissions in BetterAuth's native format.
 * Maps resource names to arrays of allowed actions.
 *
 * @example
 * ```typescript
 * const permissions: AgentuityApiKeyPermissions = {
 *   project: ['read', 'write'],
 *   user: ['read'],
 *   admin: ['*'], // wildcard - all actions
 * };
 * ```
 */
export type AgentuityApiKeyPermissions = Record<string, string[]>;

/**
 * API key context when request is authenticated via API key.
 */
export interface AgentuityApiKeyContext {
	/** API key ID from BetterAuth */
	id: string;
	/** Display name of the API key */
	name?: string | null;
	/** Permissions associated with this API key */
	permissions: AgentuityApiKeyPermissions;
	/** User ID the API key belongs to */
	userId?: string | null;
}

/**
 * Authentication method used for the current request.
 */
export type AgentuityAuthMethod = 'session' | 'api-key' | 'bearer';

// =============================================================================
// Extended Auth Interface (Agentuity-specific)
// =============================================================================

/**
 * Organization helpers available on the auth context.
 */
export interface AgentuityOrgHelpers {
	/** Active organization context if available, null otherwise */
	org: AgentuityOrgContext | null;

	/** Returns active org or null (never throws) */
	getOrg(): Promise<AgentuityOrgContext | null>;

	/** Convenience accessor for the member's role on the active org */
	getOrgRole(): Promise<string | null>;

	/** True if the current member's role is one of the provided roles */
	hasOrgRole(...roles: string[]): Promise<boolean>;
}

/**
 * API key helpers available on the auth context.
 */
export interface AgentuityApiKeyHelpers {
	/** How this request was authenticated */
	authMethod: AgentuityAuthMethod;

	/** API key context when request is authenticated via API key, null otherwise */
	apiKey: AgentuityApiKeyContext | null;

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
 * Agentuity BetterAuth auth interface.
 * Extends the generic AgentuityAuth with org and API key helpers.
 */
export type AgentuityBetterAuthAuth<TUser = unknown> = AgentuityAuth<TUser, AgentuityAuthContext> &
	AgentuityOrgHelpers &
	AgentuityApiKeyHelpers;

// =============================================================================
// withSession Types (Unified wrapper for agents)
// =============================================================================

/**
 * Options for withSession wrapper.
 */
export interface WithSessionOptions {
	/**
	 * If true, allow unauthenticated execution (auth will be null).
	 * If false (default), throws error when no auth is present.
	 */
	optional?: boolean;
}

/**
 * Context passed to withSession handlers.
 *
 * This unified context works across all execution environments:
 * - HTTP requests (session or API key auth)
 * - Agent-to-agent calls (inherits parent auth)
 * - Cron jobs (auth is null)
 * - Standalone invocations (auth is null unless manually set)
 */
export interface WithSessionContext<TUser = unknown, TSession = unknown> {
	/**
	 * BetterAuth auth context if authenticated, null otherwise.
	 *
	 * Contains the user and session data from BetterAuth.
	 * For API key auth with enableSessionForAPIKeys, this contains
	 * a mock session representing the API key's user.
	 */
	auth: AgentuityAuthContext<TUser, TSession> | null;

	/**
	 * Active organization context if the user has one set.
	 * Populated from BetterAuth's organization plugin.
	 */
	org: AgentuityOrgContext | null;
}
