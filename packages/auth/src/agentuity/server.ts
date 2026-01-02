/**
 * Auth Hono middleware and handlers for @agentuity/auth.
 *
 * Provides session and API key authentication middleware for Hono applications.
 *
 * @module agentuity/server
 */

import type { Context, MiddlewareHandler } from 'hono';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';

import type { AuthBase } from './config';
import type {
	AuthUser,
	AuthSession,
	AuthOrgContext,
	AuthApiKeyContext,
	AuthMethod,
	AuthInterface,
} from './types';

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

export interface AuthMiddlewareOptions {
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

	/**
	 * Require that the authenticated user has one of the given org roles.
	 * If the user is authenticated but lacks the required role, a 403 is returned.
	 * Only applies when authentication succeeds (ignored for optional + anonymous).
	 *
	 * @example Require admin or owner role
	 * ```typescript
	 * createSessionMiddleware(auth, { hasOrgRole: ['admin', 'owner'] })
	 * ```
	 */
	hasOrgRole?: string | string[];
}

export interface ApiKeyMiddlewareOptions {
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

	/**
	 * Require that the API key has specific permissions.
	 * If the API key lacks any required permission, a 403 is returned.
	 *
	 * @example Require project write permission
	 * ```typescript
	 * createApiKeyMiddleware(auth, { hasPermission: { project: 'write' } })
	 * ```
	 *
	 * @example Require multiple permissions
	 * ```typescript
	 * createApiKeyMiddleware(auth, {
	 *   hasPermission: { project: ['read', 'write'], admin: '*' }
	 * })
	 * ```
	 */
	hasPermission?: Record<string, string | string[]>;
}

/**
 * Hono context variables set by the middleware.
 */
export type AuthEnv = {
	Variables: {
		auth: AuthInterface<AuthUser>;
		user: AuthUser | null;
		session: AuthSession | null;
		org: AuthOrgContext | null;
	};
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Derive minimal org context from session.
 * Full org data is fetched lazily via getOrg().
 */
function deriveOrgContext(session: AuthSession | null): AuthOrgContext | null {
	if (!session?.activeOrganizationId) return null;
	return { id: session.activeOrganizationId };
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
function getAuthMethod(c: Context): AuthMethod {
	const apiKey = getApiKeyFromRequest(c);
	if (apiKey) return 'api-key';

	const authHeader = c.req.header('Authorization');
	if (authHeader?.toLowerCase().startsWith('bearer ')) return 'bearer';

	return 'session';
}

function buildAuthInterface(
	c: Context,
	auth: AuthBase,
	user: AuthUser,
	session: AuthSession | null,
	org: AuthOrgContext | null,
	authMethod: AuthMethod,
	apiKeyContext: AuthApiKeyContext | null
): AuthInterface<AuthUser> {
	let cachedFullOrg: AuthOrgContext | null | undefined = undefined;
	const permissions = apiKeyContext?.permissions ?? null;

	return {
		async getUser() {
			return user;
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
function buildAnonymousAuth(): AuthInterface<AuthUser> {
	return {
		async getUser() {
			throw new Error('Not authenticated');
		},

		async getToken() {
			return null;
		},

		raw: {
			user: null as unknown as AuthUser,
			session: null as unknown as AuthSession,
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
 * Create Hono middleware that validates sessions.
 *
 * Sets context variables (`user`, `session`, `org`, `auth`) for authenticated requests.
 *
 * OpenTelemetry spans are automatically enriched with auth attributes:
 * - `auth.user.id` - User ID (always included)
 * - `auth.user.email` - User email (included by default, opt-out via `otelSpans.email: false`)
 * - `auth.method` - 'session' or 'bearer' (always included)
 * - `auth.provider` - 'Auth' (always included)
 * - `auth.org.id` - Active organization ID (always included if set)
 * - `auth.org.name` - Organization name (included by default, opt-out via `otelSpans.orgName: false`)
 *
 * @example Basic usage
 * ```typescript
 * import { createSessionMiddleware } from '@agentuity/auth';
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
 * @example Using auth wrapper with org role check
 * ```typescript
 * app.get('/api/admin', createSessionMiddleware(auth, { hasOrgRole: ['admin', 'owner'] }), async (c) => {
 *   const user = await c.var.auth.getUser();
 *   return c.json({ id: user.id, message: 'Welcome admin!' });
 * });
 * ```
 */
export function createSessionMiddleware(
	auth: AuthBase,
	options: AuthMiddlewareOptions = {}
): MiddlewareHandler<AuthEnv> {
	const { optional = false, otelSpans = {}, hasOrgRole } = options;
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
					c.set('authSession', null);
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

			// Cast to full types - BetterAuth returns complete objects at runtime
			const user = result.user as AuthUser;
			const session = result.session as AuthSession;
			const org = deriveOrgContext(session);
			const authMethod = getAuthMethod(c);

			c.set('user', user);
			c.set('authSession', session);
			c.set('org', org);

			if (span) {
				span.setAttributes({
					'auth.user.id': user.id ?? '',
					'auth.method': authMethod,
					'auth.provider': 'AgentuityAuth',
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

			c.set('auth', buildAuthInterface(c, auth, user, session, org, authMethod, null));

			// Enforce org role if requested
			if (hasOrgRole) {
				const requiredRoles = Array.isArray(hasOrgRole) ? hasOrgRole : [hasOrgRole];
				const hasRole = await c.var.auth.hasOrgRole(...requiredRoles);

				if (!hasRole) {
					span?.addEvent('auth.forbidden', {
						reason: 'missing_org_role',
						required_roles: requiredRoles,
					});
					span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Forbidden' });
					return c.json({ error: 'Forbidden: insufficient organization role' }, 403);
				}
			}

			await next();
		} catch (error) {
			console.error('[Agentuity Auth] Session validation failed:', error);

			span?.recordException(error as Error);
			span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Auth validation failed' });

			if (optional) {
				c.set('user', null);
				c.set('authSession', null);
				c.set('org', null);
				c.set('auth', buildAnonymousAuth());
				await next();
				return;
			}
			return c.json({ error: 'Unauthorized' }, 401);
		}
	};
}

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
 * @example API key only route with permission check
 * ```typescript
 * import { createApiKeyMiddleware } from '@agentuity/auth';
 *
 * app.post('/webhooks/*', createApiKeyMiddleware(auth, {
 *   hasPermission: { webhook: 'write' }
 * }));
 *
 * app.post('/webhooks/github', async (c) => {
 *   // Permission already verified by middleware
 *   return c.json({ success: true });
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
	auth: AuthBase,
	options: ApiKeyMiddlewareOptions = {}
): MiddlewareHandler<AuthEnv> {
	const { optional = false, otelSpans = {}, hasPermission } = options;
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

			if (!result.valid || !result.key) {
				if (optional) {
					await next();
					return;
				}

				span?.addEvent('auth.unauthorized', { reason: 'invalid_api_key' });
				span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
				return c.json({ error: 'Unauthorized: Invalid API key' }, 401);
			}

			const keyData = result.key;
			const userId = keyData.userId;

			const apiKeyContext: AuthApiKeyContext = {
				id: keyData.id,
				name: keyData.name ?? null,
				permissions: keyData.permissions ?? {},
				userId: userId ?? null,
			};

			let user: AuthUser | null = null;
			if (userId) {
				try {
					// NOTE: BetterAuth's API key plugin supports resolving a user by ID via
					// `auth.api.getSession({ headers: { 'x-user-id': ... } })` without cookies.
					// The API key itself is the primary authenticator; this call is only
					// used to hydrate the user object for convenience (and is allowed to fail).
					const sessionResult = await auth.api.getSession({
						headers: new Headers({ 'x-user-id': userId }),
					});
					if (sessionResult?.user) {
						// Cast to full type - BetterAuth returns complete objects at runtime
						user = sessionResult.user as AuthUser;
					}
				} catch {
					// User fetch failed, continue with null user
				}
			}

			c.set('user', user);
			c.set('authSession', null);
			c.set('org', null);

			if (span) {
				span.setAttributes({
					'auth.method': 'api-key',
					'auth.provider': 'AgentuityAuth',
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
				c.set('auth', buildAuthInterface(c, auth, user, null, null, 'api-key', apiKeyContext));
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

			// Enforce permissions if requested
			if (hasPermission) {
				for (const [resource, actions] of Object.entries(hasPermission)) {
					const actionList = Array.isArray(actions) ? actions : [actions];
					const hasPerm = c.var.auth.hasPermission(resource, ...actionList);

					if (!hasPerm) {
						span?.addEvent('auth.forbidden', {
							reason: 'missing_permission',
							resource,
							actions: actionList,
						});
						span?.setStatus({ code: SpanStatusCode.ERROR, message: 'Forbidden' });
						return c.json({ error: 'Forbidden: insufficient API key permissions' }, 403);
					}
				}
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
 * Configuration options for mounting auth routes.
 */
export interface MountAuthRoutesOptions {
	/**
	 * Headers to forward from auth responses to the client.
	 * Only headers in this list will be forwarded (case-insensitive).
	 * `set-cookie` is always forwarded with append behavior regardless of this setting.
	 *
	 * @default ['set-cookie', 'content-type', 'location', 'cache-control', 'pragma', 'expires', 'vary', 'etag', 'last-modified']
	 */
	allowList?: string[];
}

/**
 * Mount auth routes with proper cookie handling and header filtering.
 *
 * This wrapper handles cookie merging between auth responses and other middleware.
 * It ensures both session cookies AND other cookies (like thread cookies)
 * are preserved while preventing unintended headers from leaking through.
 *
 * @example Basic usage
 * ```typescript
 * import { mountAuthRoutes } from '@agentuity/auth';
 * import { auth } from './auth';
 *
 * const api = createRouter();
 *
 * // Mount all auth routes (sign-in, sign-up, sign-out, session, etc.)
 * api.on(['GET', 'POST'], '/api/auth/*', mountAuthRoutes(auth));
 * ```
 *
 * @example With custom header allowlist
 * ```typescript
 * api.on(['GET', 'POST'], '/api/auth/*', mountAuthRoutes(auth, {
 *   allowList: ['set-cookie', 'content-type', 'location', 'x-custom-header']
 * }));
 * ```
 */
export function mountAuthRoutes(
	auth: AuthBase,
	options: MountAuthRoutesOptions = {}
): (c: Context) => Promise<Response> {
	const allowList = new Set(
		(options.allowList ?? DEFAULT_FORWARDED_HEADERS).map((h) => h.toLowerCase())
	);
	// Always ensure set-cookie is in the allowlist
	allowList.add('set-cookie');

	return async (c: Context): Promise<Response> => {
		const response = await auth.handler(c.req.raw);

		response.headers.forEach((value: string, key: string) => {
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
		auth: AuthInterface<AuthUser>;
		user: AuthUser | null;
		authSession: AuthSession | null;
		org: AuthOrgContext | null;
	}
}
