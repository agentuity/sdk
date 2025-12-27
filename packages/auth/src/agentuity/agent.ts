/**
 * Agentuity agent auth wrappers.
 *
 * Provides the unified `withSession` wrapper for protecting agents with authentication.
 * Works across all execution contexts: HTTP, agent-to-agent, cron, standalone.
 *
 * @module agentuity/agent
 */

import {
	inAgentContext,
	inHTTPContext,
	getAgentContext,
	getHTTPContext,
	type AgentContext,
} from '@agentuity/runtime';
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

		// Check for Agentuity auth wrapper (set by createSessionMiddleware or createApiKeyMiddleware)
		const rawAuth = c.var.auth;
		if (rawAuth?.raw) {
			return {
				user: rawAuth.raw.user,
				session: rawAuth.raw.session,
				org: rawAuth.raw.org ?? null,
			};
		}

		// Fallback to raw BetterAuth user/session/org vars
		const user = c.var.user;
		const session = c.var.session;
		const org = c.var.org;
		if (user && session) {
			return { user, session, org: org ?? null } as AgentuityAuthContext;
		}

		return null;
	} catch {
		return null;
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
 * Returns minimal org from auth context (just ID for now).
 */
function resolveOrg(auth: AgentuityAuthContext | null): AgentuityOrgContext | null {
	if (!inAgentContext()) return null;

	try {
		const agentCtx = getAgentContext();

		// Check cache
		if (agentCtx.state.has(ORG_STATE_KEY)) {
			return agentCtx.state.get(ORG_STATE_KEY) as AgentuityOrgContext | null;
		}

		const org = auth?.org ?? null;
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
 * Unified auth wrapper for agent handlers.
 *
 * Works across ALL execution contexts:
 * - **HTTP requests**: Extracts auth from BetterAuth session or API key
 * - **Agent-to-agent calls**: Automatically inherits auth from calling agent
 * - **Cron jobs**: `auth` is null
 * - **Standalone invocations**: `auth` is null unless manually set
 *
 * @example Basic usage (require auth)
 * ```typescript
 * import { createAgent } from '@agentuity/runtime';
 * import { withSession } from '@agentuity/auth/agentuity';
 *
 * export default createAgent('my-agent', {
 *   handler: withSession(async (ctx, { auth, org }, input) => {
 *     // auth is guaranteed non-null here
 *     // ctx is the standard AgentContext
 *     return { userId: auth.user.id };
 *   }),
 * });
 * ```
 *
 * @example Optional auth (allow anonymous)
 * ```typescript
 * export default createAgent('public-agent', {
 *   handler: withSession(async (ctx, { auth }, input) => {
 *     if (auth) {
 *       return { message: `Hello, ${auth.user.name}!` };
 *     }
 *     return { message: 'Hello, anonymous!' };
 *   }, { optional: true }),
 * });
 * ```
 *
 * @example With organization context
 * ```typescript
 * export default createAgent('org-agent', {
 *   handler: withSession(async (ctx, { auth, org }, input) => {
 *     if (!org) throw new Error('No organization selected');
 *     return { orgId: org.id, role: org.role };
 *   }),
 * });
 * ```
 */
export function withSession<TContext extends AgentContext, TInput, TOutput>(
	handler: (
		ctx: TContext,
		session: WithSessionContext,
		input: TInput
	) => Promise<TOutput> | TOutput,
	options: WithSessionOptions = {}
): (ctx: TContext, input: TInput) => Promise<TOutput> {
	const { optional = false } = options;

	return async (ctx: TContext, input: TInput): Promise<TOutput> => {
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

		// Enforce auth requirement
		if (!auth && !optional) {
			throw new Error('Unauthenticated: This agent requires authentication');
		}

		const sessionCtx: WithSessionContext = {
			auth,
			org,
		};

		return await handler(ctx, sessionCtx, input);
	};
}
