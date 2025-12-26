/**
 * Agentuity BetterAuth Hono middleware.
 *
 * Follows BetterAuth's recommended Hono integration patterns:
 * @see https://www.better-auth.com/docs/integrations/hono
 *
 * @module agentuity/server
 */

import type { MiddlewareHandler } from 'hono';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import type { AgentuityAuth, AgentuityAuthUser } from '../types';
import type { AgentuityAuthInstance } from './config';
import type { AgentuityAuthContext } from './types';
import { createScopeChecker } from './agent';

export interface AgentuityMiddlewareOptions {
	/**
	 * If true, don't return 401 on missing auth - just continue without auth context.
	 * Useful for routes that work for both authenticated and anonymous users.
	 */
	optional?: boolean;
}

/**
 * Hono context variables set by the middleware.
 *
 * Following BetterAuth's recommended pattern, we set both:
 * - `user` and `session` directly (BetterAuth standard)
 * - `auth` object (Agentuity provider pattern for consistency with Clerk/Auth0)
 */
export type AgentuityAuthEnv = {
	Variables: {
		auth: AgentuityAuth<unknown, AgentuityAuthContext>;
		user: unknown | null;
		session: unknown | null;
	};
};

/**
 * Create Hono middleware that validates BetterAuth sessions.
 *
 * Sets both BetterAuth standard context variables (`user`, `session`) and
 * the Agentuity `auth` wrapper for consistency with other providers.
 *
 * This middleware works with both:
 * - Session-based auth (cookies)
 * - API key auth (with `enableSessionForAPIKeys: true` in the API key plugin)
 *
 * OpenTelemetry spans are automatically enriched with auth attributes:
 * - `auth.user.id` - User ID
 * - `auth.user.email` - User email
 * - `auth.method` - 'session' or 'api-key'
 * - `auth.provider` - 'BetterAuth'
 * - `auth.org.id` - Active organization ID (if set)
 *
 * @example Basic usage
 * ```typescript
 * import { createMiddleware } from '@agentuity/auth/agentuity';
 * import { auth } from './auth';
 *
 * const app = new Hono();
 * app.use('/api/*', createMiddleware(auth));
 *
 * app.get('/api/me', (c) => {
 *   const user = c.var.user;
 *   if (!user) return c.json({ error: 'Unauthorized' }, 401);
 *   return c.json({ id: user.id });
 * });
 * ```
 *
 * @example Using Agentuity auth wrapper (compatible with Clerk/Auth0)
 * ```typescript
 * app.get('/api/me', async (c) => {
 *   const user = await c.var.auth.getUser();
 *   return c.json({ id: user.id });
 * });
 * ```
 *
 * @example Combined session + API key auth
 * ```typescript
 * // With enableSessionForAPIKeys: true in API key plugin config,
 * // this middleware handles both automatically
 * app.use('/api/*', createMiddleware(auth));
 *
 * // Both session cookies and x-api-key headers work
 * app.get('/api/data', (c) => {
 *   const user = c.var.user; // Works for both auth methods
 *   return c.json({ userId: user.id });
 * });
 * ```
 */
export function createMiddleware(
	auth: AgentuityAuthInstance,
	options: AgentuityMiddlewareOptions = {}
): MiddlewareHandler<AgentuityAuthEnv> {
	const { optional = false } = options;

	return async (c, next) => {
		const span = trace.getSpan(context.active());

		try {
			const session = await auth.api.getSession({
				headers: c.req.raw.headers,
			});

			if (!session) {
				if (optional) {
					// Set null values for optional mode (BetterAuth pattern)
					c.set('user', null);
					c.set('session', null);

					// Add OTEL event for anonymous access
					span?.addEvent('auth.anonymous');

					await next();
					return;
				}

				// Add OTEL attributes for unauthorized
				span?.addEvent('auth.unauthorized', { reason: 'no_session' });
				span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });

				return c.json({ error: 'Unauthorized' }, 401);
			}

			// Set user and session directly (BetterAuth recommended pattern)
			c.set('user', session.user);
			c.set('session', session.session);

			// Detect auth method (API key vs session)
			const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');
			const authHeader = c.req.header('Authorization');
			const viaApiKey = !!apiKeyHeader || authHeader?.toLowerCase().startsWith('apikey ');

			// Add OTEL attributes for successful auth
			if (span) {
				const user = session.user as Record<string, unknown>;
				const sess = session.session as Record<string, unknown>;

				span.setAttributes({
					'auth.user.id': (user.id as string) ?? '',
					'auth.user.email': (user.email as string) ?? '',
					'auth.method': viaApiKey ? 'api-key' : 'session',
					'auth.provider': 'BetterAuth',
				});

				// Add org info if present
				const activeOrgId = sess.activeOrganizationId as string | undefined;
				if (activeOrgId) {
					span.setAttribute('auth.org.id', activeOrgId);
				}
			}

			// Build the Agentuity auth wrapper for consistency with Clerk/Auth0 providers
			let cachedUser: AgentuityAuthUser<unknown> | null = null;

			const agentuityAuth: AgentuityAuth<unknown, AgentuityAuthContext> = {
				async getUser() {
					if (cachedUser) return cachedUser;
					cachedUser = {
						id: session.user.id,
						name: session.user.name ?? undefined,
						email: session.user.email ?? undefined,
						raw: session.user,
					};
					return cachedUser;
				},
				async getToken() {
					const header = c.req.header('Authorization');
					if (!header) return null;
					return header.replace(/^Bearer\s+/i, '') || null;
				},
				raw: {
					user: session.user,
					session: session.session,
				},
			};

			c.set('auth', agentuityAuth);
			await next();
		} catch (error) {
			console.error('[Agentuity Auth] Session validation failed:', error);

			// Record exception in OTEL
			span?.recordException(error as Error);
			span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Auth validation failed' });

			if (optional) {
				c.set('user', null);
				c.set('session', null);
				await next();
				return;
			}
			return c.json({ error: 'Unauthorized' }, 401);
		}
	};
}

// =============================================================================
// Scope Middleware
// =============================================================================

/**
 * Options for requireScopes middleware.
 */
export interface RequireScopesOptions {
	/**
	 * Custom function to extract scopes from the auth context.
	 * Default: looks for `session.scopes` (string[] or space-delimited string).
	 */
	getScopes?: (auth: AgentuityAuthContext) => string[];

	/**
	 * Custom unauthorized response handler.
	 */
	onUnauthorized?: (c: Parameters<MiddlewareHandler>[0]) => Response | Promise<Response>;

	/**
	 * Custom forbidden response handler.
	 */
	onForbidden?: (
		c: Parameters<MiddlewareHandler>[0],
		missingScopes: string[]
	) => Response | Promise<Response>;
}

/**
 * Default scope extractor.
 * Looks for scopes in session.scopes or user.scopes.
 */
function defaultGetScopes(auth: AgentuityAuthContext): string[] {
	const session = auth.session as Record<string, unknown>;
	const user = auth.user as Record<string, unknown>;

	const scopes = (session.scopes as string[] | string) ?? (user.scopes as string[] | string);

	if (!scopes) return [];
	if (Array.isArray(scopes)) return scopes;
	if (typeof scopes === 'string') return scopes.split(/\s+/).filter(Boolean);
	return [];
}

/**
 * Hono middleware that enforces required scopes on the current session.
 *
 * Must be used AFTER createHonoMiddleware which sets c.var.auth.
 *
 * @example Basic usage
 * ```typescript
 * import { createHonoMiddleware, requireScopes } from '@agentuity/auth/agentuity';
 *
 * app.use('/api/*', createHonoMiddleware(auth));
 *
 * // Require 'admin' scope for this route
 * app.get('/api/admin', requireScopes(['admin']), (c) => {
 *   return c.json({ admin: true });
 * });
 * ```
 *
 * @example Multiple scopes (all required)
 * ```typescript
 * app.post('/api/users', requireScopes(['user:read', 'user:write']), (c) => {
 *   // User must have BOTH scopes
 * });
 * ```
 *
 * @example Custom scope extraction
 * ```typescript
 * app.get('/api/custom', requireScopes(['read'], {
 *   getScopes: (auth) => auth.user.permissions ?? [],
 * }), (c) => {
 *   // Uses custom scope extraction logic
 * });
 * ```
 */
export function requireScopes(
	requiredScopes: string[],
	options: RequireScopesOptions = {}
): MiddlewareHandler<AgentuityAuthEnv> {
	const {
		getScopes = defaultGetScopes,
		onUnauthorized = (c) => c.json({ error: 'Unauthorized' }, 401),
		onForbidden = (c, missing) => c.json({ error: 'Forbidden', missingScopes: missing }, 403),
	} = options;

	return async (c, next) => {
		const span = trace.getSpan(context.active());
		const auth = c.var.auth;

		// No auth context - unauthorized
		if (!auth?.raw) {
			span?.addEvent('auth.scope_check.unauthorized');
			return onUnauthorized(c);
		}

		const authContext = auth.raw as AgentuityAuthContext;
		const scopes = getScopes(authContext);
		const hasScope = createScopeChecker(scopes);
		const missing = requiredScopes.filter((s) => !hasScope(s));

		if (missing.length > 0) {
			span?.addEvent('auth.scope_check.forbidden', {
				requiredScopes: requiredScopes.join(','),
				missingScopes: missing.join(','),
			});
			return onForbidden(c, missing);
		}

		// Add OTEL attributes for successful scope check
		span?.addEvent('auth.scope_check.passed', {
			requiredScopes: requiredScopes.join(','),
		});

		return next();
	};
}

// =============================================================================
// Type Augmentation
// =============================================================================

declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<unknown, AgentuityAuthContext>;
		user: unknown | null;
		session: unknown | null;
	}
}
