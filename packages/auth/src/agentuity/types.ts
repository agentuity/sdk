/**
 * Agentuity BetterAuth integration types.
 *
 * @module agentuity/types
 */

import type { Session, User } from 'better-auth';

/**
 * Auth context passed to agents and available on Hono context.
 */
export interface AgentuityAuthContext<TUser = User, TSession = Session> {
	user: TUser;
	session: TSession;
}

/**
 * Options for withAuth wrapper.
 */
export interface WithAuthOptions {
	/** Scopes required to execute the handler */
	requiredScopes?: string[];
	/** If true, allow unauthenticated requests */
	optional?: boolean;
}

/**
 * Agent handler with auth context.
 */
export type AuthenticatedHandler<TInput, TOutput, TUser = User, TSession = Session> = (
	ctx: { auth: AgentuityAuthContext<TUser, TSession> },
	input: TInput
) => Promise<TOutput>;
