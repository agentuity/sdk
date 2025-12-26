/**
 * Agentuity BetterAuth integration types.
 *
 * @module agentuity/types
 */

import type { Session, User } from 'better-auth';

/**
 * BetterAuth context containing user and session data.
 * This is the raw auth context from BetterAuth's session validation.
 */
export interface AgentuityAuthContext<TUser = User, TSession = Session> {
	user: TUser;
	session: TSession;
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
// withSession Types (Unified wrapper for agents)
// =============================================================================

/**
 * Options for withSession wrapper.
 */
export interface WithSessionOptions {
	/**
	 * Scopes required to execute the handler.
	 * Handler will throw if user doesn't have all required scopes.
	 */
	requiredScopes?: string[];

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

	/**
	 * Check if the current auth context has a specific scope.
	 * Returns false if not authenticated or scope is missing.
	 *
	 * @example
	 * ```typescript
	 * if (!ctx.hasScope('admin')) {
	 *   throw new Error('Admin access required');
	 * }
	 * ```
	 */
	hasScope: (scope: string) => boolean;
}
