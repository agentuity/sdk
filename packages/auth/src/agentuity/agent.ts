/**
 * Agentuity agent auth wrappers.
 *
 * Provides the unified `withSession` wrapper for protecting agents with authentication.
 * Works across all execution contexts: HTTP, agent-to-agent, cron, standalone.
 *
 * @module agentuity/agent
 */

import { inAgentContext, inHTTPContext, getAgentContext, getHTTPContext } from '@agentuity/runtime';
import type {
	WithSessionOptions,
	WithSessionContext,
	AgentuityAuthContext,
	AgentuityOrgContext,
} from './types';

/**
 * Key used to cache auth context in AgentContext.state.
 * This enables automatic auth propagation between agent-to-agent calls.
 */
const AUTH_STATE_KEY = '@agentuity/auth';

/**
 * Key used to cache org context in AgentContext.state.
 */
const ORG_STATE_KEY = '@agentuity/org';

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Extract auth context from HTTP context (Hono c.var.auth).
 * Returns null if not in HTTP context or no auth present.
 */
function extractAuthFromHttp(): AgentuityAuthContext | null {
	if (!inHTTPContext()) return null;

	try {
		const c = getHTTPContext();

		// Check for Agentuity auth wrapper (set by createHonoMiddleware)
		const rawAuth = c.var.auth;
		if (rawAuth?.raw) {
			return {
				user: rawAuth.raw.user,
				session: rawAuth.raw.session,
			};
		}

		// Fallback to raw BetterAuth user/session vars
		const user = c.var.user;
		const session = c.var.session;
		if (user && session) {
			return { user, session } as AgentuityAuthContext;
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Extract organization context from auth context.
 * Uses BetterAuth's organization plugin data from session.
 */
function extractOrgFromAuth(auth: AgentuityAuthContext | null): AgentuityOrgContext | null {
	if (!auth) return null;

	try {
		// BetterAuth org plugin stores active org on session
		const session = auth.session as Record<string, unknown>;
		const user = auth.user as Record<string, unknown>;

		const activeOrgId =
			(session.activeOrganizationId as string) ??
			(user.activeOrganizationId as string) ??
			((user.activeOrganization as Record<string, unknown>)?.id as string);

		if (!activeOrgId) return null;

		const activeOrg = user.activeOrganization as Record<string, unknown> | undefined;

		return {
			id: activeOrgId,
			slug: (activeOrg?.slug as string) ?? null,
			name: (activeOrg?.name as string) ?? null,
			role:
				(session.activeOrganizationRole as string) ??
				(user.activeOrganizationRole as string) ??
				null,
			memberId:
				(session.activeOrganizationMemberId as string) ??
				(user.activeOrganizationMemberId as string) ??
				null,
			metadata: activeOrg?.metadata,
		};
	} catch {
		return null;
	}
}

/**
 * Extract scopes from auth context.
 * Looks for scopes in session claims, user claims, or API key permissions.
 */
function extractScopes(auth: AgentuityAuthContext | null): string[] {
	if (!auth) return [];

	try {
		const session = auth.session as Record<string, unknown>;
		const user = auth.user as Record<string, unknown>;

		// Check various possible scope locations
		const scopes =
			(session.scopes as string[] | string) ??
			(user.scopes as string[] | string) ??
			(session.permissions as string[] | string) ??
			[];

		if (Array.isArray(scopes)) return scopes;
		if (typeof scopes === 'string') return scopes.split(/\s+/).filter(Boolean);
		return [];
	} catch {
		return [];
	}
}

/**
 * Resolve auth context from current execution environment.
 *
 * Resolution order:
 * 1. Cached in AgentContext.state (for agent-to-agent propagation)
 * 2. From HTTP context (BetterAuth session or API key)
 * 3. null (cron/standalone with no auth)
 */
function resolveAuth(): AgentuityAuthContext | null {
	if (!inAgentContext()) {
		// Not in agent context - this shouldn't happen if withSession is used correctly
		// Return null and let the wrapper handle the error
		return null;
	}

	try {
		const agentCtx = getAgentContext();

		// 1) Check cache in AgentContext.state
		if (agentCtx.state.has(AUTH_STATE_KEY)) {
			return agentCtx.state.get(AUTH_STATE_KEY) as AgentuityAuthContext | null;
		}

		// 2) Try HTTP context (BetterAuth middleware)
		const fromHttp = extractAuthFromHttp();
		if (fromHttp) {
			agentCtx.state.set(AUTH_STATE_KEY, fromHttp);
			return fromHttp;
		}

		// 3) No auth available (cron, standalone)
		agentCtx.state.set(AUTH_STATE_KEY, null);
		return null;
	} catch {
		return null;
	}
}

/**
 * Resolve org context, with caching.
 */
function resolveOrg(auth: AgentuityAuthContext | null): AgentuityOrgContext | null {
	if (!inAgentContext()) return null;

	try {
		const agentCtx = getAgentContext();

		// Check cache
		if (agentCtx.state.has(ORG_STATE_KEY)) {
			return agentCtx.state.get(ORG_STATE_KEY) as AgentuityOrgContext | null;
		}

		const org = extractOrgFromAuth(auth);
		agentCtx.state.set(ORG_STATE_KEY, org);
		return org;
	} catch {
		return null;
	}
}

// =============================================================================
// Public API
// =============================================================================

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

/**
 * Create a role-to-scope checker.
 *
 * Maps organization roles to scopes and returns a scope checker.
 *
 * @example
 * ```typescript
 * const roleScopes = {
 *   owner: ['*'],
 *   admin: ['project:read', 'project:write', 'user:read'],
 *   member: ['project:read'],
 * };
 * const hasScope = createRoleScopeChecker('admin', roleScopes);
 * hasScope('project:write'); // true
 * hasScope('user:delete'); // false
 * ```
 */
export function createRoleScopeChecker(
	role: string | null | undefined,
	roleScopes: Record<string, string[]>
): (scope: string) => boolean {
	const scopes = role ? (roleScopes[role] ?? []) : [];
	return createScopeChecker(scopes);
}

/**
 * Unified auth wrapper for agent handlers.
 *
 * Works across ALL execution contexts:
 * - **HTTP requests**: Extracts auth from BetterAuth session or API key
 * - **Agent-to-agent calls**: Automatically inherits auth from calling agent
 * - **Cron jobs**: `auth` is null, `hasScope()` returns false
 * - **Standalone invocations**: `auth` is null unless manually set
 *
 * @example Basic usage (require auth)
 * ```typescript
 * import { createAgent } from '@agentuity/runtime';
 * import { withSession } from '@agentuity/auth/agentuity';
 *
 * export default createAgent('my-agent', {
 *   handler: withSession(async ({ auth, org, hasScope }, input) => {
 *     // auth is guaranteed non-null here
 *     return { userId: auth.user.id };
 *   }),
 * });
 * ```
 *
 * @example Optional auth (allow anonymous)
 * ```typescript
 * export default createAgent('public-agent', {
 *   handler: withSession(async ({ auth }, input) => {
 *     if (auth) {
 *       return { message: `Hello, ${auth.user.name}!` };
 *     }
 *     return { message: 'Hello, anonymous!' };
 *   }, { optional: true }),
 * });
 * ```
 *
 * @example With scope requirements
 * ```typescript
 * export default createAgent('admin-agent', {
 *   handler: withSession(async ({ auth, hasScope }, input) => {
 *     // Will throw if user doesn't have 'admin' scope
 *     return { isAdmin: true };
 *   }, { requiredScopes: ['admin'] }),
 * });
 * ```
 *
 * @example With organization context
 * ```typescript
 * export default createAgent('org-agent', {
 *   handler: withSession(async ({ auth, org }, input) => {
 *     if (!org) throw new Error('No organization selected');
 *     return { orgId: org.id, role: org.role };
 *   }),
 * });
 * ```
 */
export function withSession<TInput, TOutput>(
	handler: (ctx: WithSessionContext, input: TInput) => Promise<TOutput> | TOutput,
	options: WithSessionOptions = {}
): (input: TInput) => Promise<TOutput> {
	const { requiredScopes = [], optional = false } = options;

	return async (input: TInput): Promise<TOutput> => {
		// Verify we're in an agent context
		if (!inAgentContext()) {
			throw new Error(
				'withSession must be used inside an Agentuity agent. ' +
					'Ensure the handler is executed within an agent context (HTTP request, agent call, or createAgentContext).'
			);
		}

		// Resolve auth (from HTTP context or cache)
		const auth = resolveAuth();
		const org = resolveOrg(auth);
		const scopes = extractScopes(auth);
		const hasScope = createScopeChecker(scopes);

		// Enforce auth requirement
		if (!auth && !optional) {
			throw new Error('Unauthenticated: This agent requires authentication');
		}

		// Enforce scope requirements
		if (requiredScopes.length > 0) {
			const missing = requiredScopes.filter((s) => !hasScope(s));
			if (missing.length > 0) {
				throw new Error(`Forbidden: Missing required scopes: ${missing.join(', ')}`);
			}
		}

		const sessionCtx: WithSessionContext = {
			auth,
			org,
			hasScope,
		};

		return await handler(sessionCtx, input);
	};
}
