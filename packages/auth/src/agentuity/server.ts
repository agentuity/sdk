/**
 * Agentuity BetterAuth Hono middleware.
 *
 * Follows BetterAuth's recommended Hono integration patterns:
 * @see https://www.better-auth.com/docs/integrations/hono
 *
 * @module agentuity/server
 */

import type { MiddlewareHandler } from 'hono';
import type { AgentuityAuth, AgentuityAuthUser } from '../types';
import type { AgentuityAuthInstance } from './config';
import type { AgentuityAuthContext } from './types';

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
 * @example Using BetterAuth pattern (recommended)
 * ```typescript
 * import { createHonoMiddleware } from '@agentuity/auth/agentuity';
 * import { auth } from './auth';
 *
 * const app = new Hono();
 * app.use('/api/*', createHonoMiddleware(auth));
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
 */
export function createHonoMiddleware(
	auth: AgentuityAuthInstance,
	options: AgentuityMiddlewareOptions = {}
): MiddlewareHandler<AgentuityAuthEnv> {
	const { optional = false } = options;

	return async (c, next) => {
		try {
			const session = await auth.api.getSession({
				headers: c.req.raw.headers,
			});

			if (!session) {
				if (optional) {
					// Set null values for optional mode (BetterAuth pattern)
					c.set('user', null);
					c.set('session', null);
					await next();
					return;
				}
				return c.json({ error: 'Unauthorized' }, 401);
			}

			// Set user and session directly (BetterAuth recommended pattern)
			c.set('user', session.user);
			c.set('session', session.session);

			// Also set the Agentuity auth wrapper for consistency with Clerk/Auth0 providers
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
					const authHeader = c.req.header('Authorization');
					if (!authHeader) return null;
					return authHeader.replace(/^Bearer\s+/i, '') || null;
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

declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<unknown, AgentuityAuthContext>;
		user: unknown | null;
		session: unknown | null;
	}
}
