/**
 * Agentuity BetterAuth Hono middleware and handlers.
 *
 * Follows BetterAuth's recommended Hono integration patterns:
 * @see https://www.better-auth.com/docs/integrations/hono
 *
 * @module agentuity/server
 */

import type { Context, MiddlewareHandler } from 'hono';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import type { Session, User } from 'better-auth';
import type { AgentuityAuthUser } from '../types';
import type { AgentuityAuthInstance } from './config';
import type {
	AgentuityOrgContext,
	AgentuityApiKeyContext,
	AgentuityAuthMethod,
	AgentuityBetterAuthAuth,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for OpenTelemetry span attributes.
 * All attributes are included by default. Set to `false` to opt-out of specific PII.
 */
export interface OtelSpansConfig {
	/**
	 * Include user email in spans (`auth.user.email`).
	 * @default true
	 */
	email?: boolean;

	/**
	 * Include organization name in spans (`auth.org.name`).
	 * @default true
	 */
	orgName?: boolean;
}

export interface AgentuityMiddlewareOptions {
	/**
	 * If true, don't return 401 on missing auth - just continue without auth context.
	 * Useful for routes that work for both authenticated and anonymous users.
	 */
	optional?: boolean;

	/**
	 * Configure which attributes are included in OpenTelemetry spans.
	 * All PII attributes are included by default. Use this to opt-out of specific fields.
	 *
	 * @example Disable email in spans
	 * ```typescript
	 * createSessionMiddleware(auth, { otelSpans: { email: false } })
	 * ```
	 */
	otelSpans?: OtelSpansConfig;
}

export interface AgentuityApiKeyMiddlewareOptions {
	/**
	 * If true, don't return 401 on missing/invalid API key - just continue without auth context.
	 */
	optional?: boolean;

	/**
	 * Configure which attributes are included in OpenTelemetry spans.
	 * All PII attributes are included by default. Use this to opt-out of specific fields.
	 *
	 * @example Disable email in spans
	 * ```typescript
	 * createApiKeyMiddleware(auth, { otelSpans: { email: false } })
	 * ```
	 */
	otelSpans?: OtelSpansConfig;
}

/**
 * Hono context variables set by the middleware.
 */
export type AgentuityAuthEnv = {
	Variables: {
		auth: AgentuityBetterAuthAuth;
		user: User | null;
		session: Session | null;
		org: AgentuityOrgContext | null;
	};
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Derive minimal org context from session.
 * Full org data is fetched lazily via getOrg(). Later we might add more to org context so keeping this here.
 */
function deriveOrgContext(session: Session): AgentuityOrgContext | null {
	const s = session as Record<string, unknown>;
	const id = s.activeOrganizationId as string | undefined;
	if (!id) return null;
	return { id } as AgentuityOrgContext;
}

/**
 * Extract API key from request headers.
 * Checks x-agentuity-auth-api-key header and Authorization: ApiKey header.
 */
function getApiKeyFromRequest(c: Context): string | null {
	const customHeader =
		c.req.header('x-agentuity-auth-api-key') ?? c.req.header('X-Agentuity-Auth-Api-Key');
	if (customHeader) return customHeader.trim();

	const authHeader = c.req.header('Authorization');
	if (!authHeader) return null;

	const lower = authHeader.toLowerCase();
	if (lower.startsWith('apikey ')) {
		return authHeader.slice('apikey '.length).trim() || null;
	}

	return null;
}

/**
 * Determine auth method from request headers.
 */
function getAuthMethod(c: Context): AgentuityAuthMethod {
	const apiKey = getApiKeyFromRequest(c);
	if (apiKey) return 'api-key';

	const authHeader = c.req.header('Authorization');
	if (authHeader?.toLowerCase().startsWith('bearer ')) return 'bearer';

	return 'session';
}

function buildAgentuityAuth(
	c: Context,
	auth: AgentuityAuthInstance,
	user: User,
	session: Session,
	org: AgentuityOrgContext | null,
	authMethod: AgentuityAuthMethod,
	apiKeyContext: AgentuityApiKeyContext | null
): AgentuityBetterAuthAuth {
	let cachedUser: AgentuityAuthUser<User> | null = null;
	let cachedFullOrg: AgentuityOrgContext | null | undefined = undefined;
	const permissions = apiKeyContext?.permissions ?? null;

	return {
		async getUser() {
			if (cachedUser) return cachedUser;
			cachedUser = {
				id: user.id,
				name: user.name ?? undefined,
				email: user.email ?? undefined,
				raw: user,
			};
			return cachedUser;
		},

		async getToken() {
			const header = c.req.header('Authorization');
			if (!header) return null;
			return header.replace(/^Bearer\s+/i, '') || null;
		},

		raw: {
			user,
			session,
			org,
		},

		org,

		async getOrg() {
			if (cachedFullOrg !== undefined) {
				return cachedFullOrg;
			}

			if (!org) {
				cachedFullOrg = null;
				return null;
			}

			// Fetch full org data lazily
			try {
				const fullOrg = await auth.api.getFullOrganization({
					headers: c.req.raw.headers,
				});

				if (!fullOrg) {
					cachedFullOrg = null;
					return null;
				}

				// Find the current user's role in the org
				const members = (fullOrg.members ?? []) as Array<{
					userId: string;
					role: string;
					id: string;
				}>;
				const currentMember = members.find((m) => m.userId === user.id);

				cachedFullOrg = {
					id: fullOrg.id,
					slug: fullOrg.slug ?? null,
					name: fullOrg.name ?? null,
					role: currentMember?.role ?? null,
					memberId: currentMember?.id ?? null,
					metadata: (fullOrg as Record<string, unknown>).metadata ?? null,
				};

				return cachedFullOrg;
			} catch {
				cachedFullOrg = org;
				return org;
			}
		},

		async getOrgRole() {
			const org = await this.getOrg();
			return org?.role ?? null;
		},

		async hasOrgRole(...roles: string[]) {
			const role = await this.getOrgRole();
			return !!role && roles.includes(role);
		},

		// API key helpers
		authMethod,
		apiKey: apiKeyContext,

		hasPermission(resource: string, ...actions: string[]) {
			if (!permissions) return false;
			const resourcePerms = permissions[resource] ?? [];

			if (actions.length === 0) {
				return resourcePerms.length > 0;
			}

			return actions.every(
				(action) => resourcePerms.includes(action) || resourcePerms.includes('*')
			);
		},
	};
}

/**
 * Build a null/anonymous auth wrapper for optional middleware.
 */
function buildAnonymousAuth(): AgentuityBetterAuthAuth {
	return {
		async getUser() {
			throw new Error('Not authenticated');
		},

		async getToken() {
			return null;
		},

		raw: {
			user: null as unknown as User,
			session: null as unknown as Session,
			org: null,
		},

		org: null,

		async getOrg() {
			return null;
		},

		async getOrgRole() {
			return null;
		},

		async hasOrgRole() {
			return false;
		},

		authMethod: 'session',
		apiKey: null,

		hasPermission() {
			return false;
		},
	};
}

// =============================================================================
// Session Middleware
// =============================================================================

/**
 * Create Hono middleware that validates BetterAuth sessions.
 *
 * Sets both BetterAuth standard context variables (`user`, `session`, `org`) and
 * the Agentuity `auth` wrapper for consistency with other providers.
 *
 * OpenTelemetry spans are automatically enriched with auth attributes:
 * - `auth.user.id` - User ID (always included)
 * - `auth.user.email` - User email (included by default, opt-out via `otelSpans.email: false`)
 * - `auth.method` - 'session' or 'bearer' (always included)
 * - `auth.provider` - 'BetterAuth' (always included)
 * - `auth.org.id` - Active organization ID (always included if set)
 * - `auth.org.name` - Organization name (included by default, opt-out via `otelSpans.orgName: false`)
 *
 * @example Basic usage
 * ```typescript
 * import { createSessionMiddleware } from '@agentuity/auth/agentuity';
 * import { auth } from './auth';
 *
 * const app = new Hono();
 * app.use('/api/*', createSessionMiddleware(auth));
 *
 * app.get('/api/me', (c) => {
 *   const user = c.var.user;
 *   if (!user) return c.json({ error: 'Unauthorized' }, 401);
 *   return c.json({ id: user.id });
 * });
 * ```
 *
 * @example Using Agentuity auth wrapper
 * ```typescript
 * app.get('/api/me', async (c) => {
 *   const user = await c.var.auth.getUser();
 *   const org = await c.var.auth.getOrg();
 *   const isAdmin = await c.var.auth.hasOrgRole('admin', 'owner');
 *   return c.json({ id: user.id, org, isAdmin });
 * });
 * ```
 */
export function createSessionMiddleware(
	auth: AgentuityAuthInstance,
	options: AgentuityMiddlewareOptions = {}
): MiddlewareHandler<AgentuityAuthEnv> {
	const { optional = false, otelSpans = {} } = options;
	const includeEmail = otelSpans.email !== false;
	const includeOrgName = otelSpans.orgName !== false;

	return async (c, next) => {
		const span = trace.getSpan(context.active());

		try {
			const result = await auth.api.getSession({
				headers: c.req.raw.headers,
			});

			if (!result) {
				if (optional) {
					c.set('user', null);
					c.set('session', null);
					c.set('org', null);
					c.set('auth', buildAnonymousAuth());
					span?.addEvent('auth.anonymous');
					await next();
					return;
				}

				span?.addEvent('auth.unauthorized', { reason: 'no_session' });
				span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
				return c.json({ error: 'Unauthorized' }, 401);
			}

			const { user, session } = result;
			const org = deriveOrgContext(session);
			const authMethod = getAuthMethod(c);

			c.set('user', user);
			c.set('session', session);
			c.set('org', org);

			if (span) {
				span.setAttributes({
					'auth.user.id': user.id ?? '',
					'auth.method': authMethod,
					'auth.provider': 'BetterAuth',
				});

				if (includeEmail && user.email) {
					span.setAttribute('auth.user.email', user.email);
				}

				if (org) {
					span.setAttribute('auth.org.id', org.id);
					if (includeOrgName && org.name) {
						span.setAttribute('auth.org.name', org.name);
					}
				}
			}

			c.set('auth', buildAgentuityAuth(c, auth, user, session, org, authMethod, null));
			await next();
		} catch (error) {
			console.error('[Agentuity Auth] Session validation failed:', error);

			span?.recordException(error as Error);
			span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Auth validation failed' });

			if (optional) {
				c.set('user', null);
				c.set('session', null);
				c.set('org', null);
				c.set('auth', buildAnonymousAuth());
				await next();
				return;
			}
			return c.json({ error: 'Unauthorized' }, 401);
		}
	};
}

/**
 * Alias for createSessionMiddleware for backward compatibility.
 * @deprecated Use createSessionMiddleware instead.
 */
export const createMiddleware = createSessionMiddleware;

// =============================================================================
// API Key Middleware
// =============================================================================

/**
 * Create Hono middleware that validates API keys.
 *
 * This middleware ONLY accepts API key authentication via:
 * - `x-agentuity-auth-api-key` header (preferred)
 * - `Authorization: ApiKey <key>` header
 *
 * It does NOT use sessions. For routes that accept both session and API key,
 * compose with createSessionMiddleware using `{ optional: true }`.
 *
 * @example API key only route
 * ```typescript
 * import { createApiKeyMiddleware } from '@agentuity/auth/agentuity';
 *
 * app.post('/webhooks/*', createApiKeyMiddleware(auth));
 *
 * app.post('/webhooks/github', async (c) => {
 *   const hasWrite = c.var.auth.hasPermission('webhook', 'write');
 *   if (!hasWrite) return c.json({ error: 'Forbidden' }, 403);
 *   // ...
 * });
 * ```
 *
 * @example Either session OR API key (compose with optional)
 * ```typescript
 * app.use('/api/*', createSessionMiddleware(auth, { optional: true }));
 * app.use('/api/*', createApiKeyMiddleware(auth, { optional: true }));
 *
 * app.get('/api/data', async (c) => {
 *   // Works with session OR API key
 *   if (!c.var.user) return c.json({ error: 'Unauthorized' }, 401);
 *   return c.json({ data: '...' });
 * });
 * ```
 */
export function createApiKeyMiddleware(
	auth: AgentuityAuthInstance,
	options: AgentuityApiKeyMiddlewareOptions = {}
): MiddlewareHandler<AgentuityAuthEnv> {
	const { optional = false, otelSpans = {} } = options;
	const includeEmail = otelSpans.email !== false;

	return async (c, next) => {
		const span = trace.getSpan(context.active());
		const apiKeyToken = getApiKeyFromRequest(c);

		if (!apiKeyToken) {
			if (optional) {
				await next();
				return;
			}

			span?.addEvent('auth.unauthorized', { reason: 'no_api_key' });
			span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
			return c.json({ error: 'Unauthorized: API key required' }, 401);
		}

		try {
			const result = await auth.api.verifyApiKey({
				body: { key: apiKeyToken },
			});

			if (!result.valid || !result.apiKey) {
				if (optional) {
					await next();
					return;
				}

				span?.addEvent('auth.unauthorized', { reason: 'invalid_api_key' });
				span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
				return c.json({ error: 'Unauthorized: Invalid API key' }, 401);
			}

			const keyData = result.apiKey;
			const userId = keyData.userId;

			const apiKeyContext: AgentuityApiKeyContext = {
				id: keyData.id,
				name: keyData.name ?? null,
				permissions: keyData.permissions ?? {},
				userId: userId ?? null,
			};

			let user: User | null = null;
			if (userId) {
				try {
					const session = await auth.api.getSession({
						headers: new Headers({ 'x-user-id': userId }),
					});
					if (session?.user) {
						user = session.user;
					}
				} catch {
					// User fetch failed, continue with null user
				}
			}

			c.set('user', user);
			c.set('session', null);
			c.set('org', null);

			if (span) {
				span.setAttributes({
					'auth.method': 'api-key',
					'auth.provider': 'BetterAuth',
					'auth.api_key.id': apiKeyContext.id,
				});

				if (user?.id) {
					span.setAttribute('auth.user.id', user.id);
				}

				if (includeEmail && user?.email) {
					span.setAttribute('auth.user.email', user.email);
				}
			}

			if (user) {
				c.set(
					'auth',
					buildAgentuityAuth(
						c,
						auth,
						user,
						null as unknown as Session,
						null,
						'api-key',
						apiKeyContext
					)
				);
			} else {
				const anonAuth = buildAnonymousAuth();
				c.set('auth', {
					...anonAuth,
					authMethod: 'api-key',
					apiKey: apiKeyContext,
					hasPermission(resource: string, ...actions: string[]) {
						const perms = apiKeyContext.permissions[resource] ?? [];
						if (actions.length === 0) return perms.length > 0;
						return actions.every((a) => perms.includes(a) || perms.includes('*'));
					},
				});
			}

			await next();
		} catch (error) {
			console.error('[Agentuity Auth] API key validation failed:', error);

			span?.recordException(error as Error);
			span?.setStatus({ code: SpanStatusCode.ERROR, message: 'API key validation failed' });

			if (optional) {
				await next();
				return;
			}
			return c.json({ error: 'Unauthorized: API key validation failed' }, 401);
		}
	};
}

// =============================================================================
// Auth Handler
// =============================================================================

/**
 * Default headers to forward from BetterAuth responses.
 * This prevents unintended headers from leaking through while preserving auth-essential ones.
 */
const DEFAULT_FORWARDED_HEADERS = [
	'set-cookie',
	'content-type',
	'location',
	'cache-control',
	'pragma',
	'expires',
	'vary',
	'etag',
	'last-modified',
];

/**
 * Configuration options for mounting BetterAuth routes.
 */
export interface MountBetterAuthRoutesOptions {
	/**
	 * Headers to forward from BetterAuth responses to the client.
	 * Only headers in this list will be forwarded (case-insensitive).
	 * `set-cookie` is always forwarded with append behavior regardless of this setting.
	 *
	 * @default ['set-cookie', 'content-type', 'location', 'cache-control', 'pragma', 'expires', 'vary', 'etag', 'last-modified']
	 */
	allowList?: string[];
}

/**
 * Mount BetterAuth routes with proper cookie handling and header filtering.
 *
 * This wrapper is required because of how Hono handles raw `Response` objects
 * returned from route handlers. When BetterAuth's `auth.handler()` returns a
 * `Response` with `Set-Cookie` headers, those headers are not automatically
 * merged with headers set by Agentuity's middleware (like the `atid` thread cookie).
 *
 * This function copies only allowed headers from BetterAuth's response into
 * Hono's context, ensuring both BetterAuth's session cookies AND Agentuity's
 * cookies are preserved while preventing unintended headers from leaking through.
 *
 * @example Basic usage
 * ```typescript
 * import { mountBetterAuthRoutes } from '@agentuity/auth/agentuity';
 * import { auth } from './auth';
 *
 * const api = createRouter();
 *
 * // Mount all BetterAuth routes (sign-in, sign-up, sign-out, session, etc.)
 * api.on(['GET', 'POST'], '/api/auth/*', mountBetterAuthRoutes(auth));
 * ```
 *
 * @example With custom header allowlist
 * ```typescript
 * api.on(['GET', 'POST'], '/api/auth/*', mountBetterAuthRoutes(auth, {
 *   allowList: ['set-cookie', 'content-type', 'location', 'x-custom-header']
 * }));
 * ```
 */
export function mountBetterAuthRoutes(
	auth: AgentuityAuthInstance,
	options: MountBetterAuthRoutesOptions = {}
): (c: Context) => Promise<Response> {
	const allowList = new Set(
		(options.allowList ?? DEFAULT_FORWARDED_HEADERS).map((h) => h.toLowerCase())
	);
	// Always ensure set-cookie is in the allowlist
	allowList.add('set-cookie');

	return async (c: Context): Promise<Response> => {
		const response = await auth.handler(c.req.raw);

		response.headers.forEach((value, key) => {
			const lower = key.toLowerCase();

			// Only forward headers in the allowlist
			if (!allowList.has(lower)) {
				return;
			}

			if (lower === 'set-cookie') {
				// Preserve existing cookies (e.g., Agentuity thread cookies)
				c.header('set-cookie', value, { append: true });
			} else {
				c.header(key, value);
			}
		});

		const body = await response.text();
		return new Response(body, {
			status: response.status,
			headers: c.res.headers,
		});
	};
}

// =============================================================================
// Type Augmentation
// =============================================================================

declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityBetterAuthAuth;
		user: User | null;
		session: Session | null;
		org: AgentuityOrgContext | null;
	}
}
