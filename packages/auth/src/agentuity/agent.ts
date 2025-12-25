/**
 * Agentuity agent auth wrappers.
 *
 * Provides helpers for protecting agents with authentication.
 *
 * @module agentuity/agent
 */

import type { WithAuthOptions, AgentuityAuthContext } from './types';

/**
 * Context passed to authenticated agent handlers.
 */
export interface AgentAuthContext {
	auth: AgentuityAuthContext | null;
	hasScope: (scope: string) => boolean;
}

/**
 * Wrap an agent handler with authentication checks.
 *
 * This is a type-safe wrapper that ensures the handler receives
 * an authenticated context. If authentication fails, an error is thrown.
 *
 * @example
 * ```typescript
 * import { withAuth } from '@agentuity/auth/agentuity';
 *
 * const handler = withAuth(
 *   async (ctx, input) => {
 *     // ctx.auth is guaranteed to be present
 *     const userId = ctx.auth.user.id;
 *     return { result: `Hello ${userId}` };
 *   },
 *   { requiredScopes: ['write'] }
 * );
 * ```
 *
 * @example Optional auth (allows unauthenticated)
 * ```typescript
 * const handler = withAuth(
 *   async (ctx, input) => {
 *     if (ctx.auth) {
 *       return { user: ctx.auth.user.id };
 *     }
 *     return { user: 'anonymous' };
 *   },
 *   { optional: true }
 * );
 * ```
 */
export function withAuth<TInput, TOutput>(
	handler: (ctx: AgentAuthContext, input: TInput) => Promise<TOutput>,
	options: WithAuthOptions = {}
): (ctx: AgentAuthContext, input: TInput) => Promise<TOutput> {
	const { requiredScopes = [], optional = false } = options;

	return async (ctx: AgentAuthContext, input: TInput): Promise<TOutput> => {
		if (!ctx.auth && !optional) {
			throw new Error('Unauthenticated: This agent requires authentication');
		}

		if (requiredScopes.length > 0 && ctx.auth) {
			const missingScopes = requiredScopes.filter((scope) => !ctx.hasScope(scope));
			if (missingScopes.length > 0) {
				throw new Error(`Forbidden: Missing required scopes: ${missingScopes.join(', ')}`);
			}
		}

		return handler(ctx, input);
	};
}

/**
 * Create a scope checker function.
 *
 * @example
 * ```typescript
 * const hasScope = createScopeChecker(['read', 'write', 'admin']);
 * hasScope('read'); // true
 * hasScope('delete'); // false
 * hasScope('*'); // true (if '*' is in scopes)
 * ```
 */
export function createScopeChecker(scopes: string[]): (scope: string) => boolean {
	const scopeSet = new Set(scopes);
	return (scope: string) => {
		if (scopeSet.has('*')) return true;
		return scopeSet.has(scope);
	};
}
