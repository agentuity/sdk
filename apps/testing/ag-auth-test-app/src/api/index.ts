import { createRouter } from '@agentuity/runtime';
import { mountBetterAuthRoutes, requireScopes } from '@agentuity/auth/agentuity';
import { APIError } from 'better-auth/api';
import hello from '@agent/hello';
import { auth, authMiddleware, optionalAuthMiddleware } from '../auth';

const api = createRouter();

// Mount BetterAuth routes (sign-in, sign-up, sign-out, session, token, etc.)
// See mountBetterAuthRoutes docs for why this wrapper is required
api.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(auth));

// Public route - no auth required
api.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Hello route with optional auth (to test withSession)
api.post('/hello', optionalAuthMiddleware, hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

// Protected route - requires authentication (session or API key)
api.get('/me', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();

	// Detect auth method for demo purposes
	const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');
	const bearerHeader = c.req.header('authorization')?.toLowerCase().startsWith('bearer ');
	const authMethod = apiKeyHeader ? 'api-key' : bearerHeader ? 'bearer' : 'session';

	return c.json({
		id: user.id,
		name: user.name,
		email: user.email,
		authMethod,
	});
});

// Optional auth route - works for both authenticated and anonymous users
api.get('/greeting', optionalAuthMiddleware, async (c) => {
	try {
		const user = await c.var.auth.getUser();
		return c.json({ message: `Hello, ${user.name || user.email}!` });
	} catch {
		return c.json({ message: 'Hello, anonymous user!' });
	}
});

// Protected route with token
api.get('/token', authMiddleware, async (c) => {
	const token = await c.var.auth.getToken();
	return c.json({
		hasToken: token !== null,
		tokenPreview: token ? `${token.slice(0, 10)}...` : null,
	});
});

// =============================================================================
// Scope-Based Access Control Examples
// =============================================================================

/**
 * Custom scope extractor that works with BetterAuth's API key permissions.
 * BetterAuth uses `permissions: Record<string, string[]>` format, e.g.:
 *   { project: ['read', 'write'], admin: ['*'] }
 *
 * This extractor converts them to flat scopes like:
 *   ['project:read', 'project:write', 'admin:*']
 *
 * It also checks org roles for role-based scopes.
 *
 * NOTE: For API keys with permissions, we need to verify the key to get permissions
 * since enableSessionForAPIKeys doesn't include them in the mock session.
 */
function extractBetterAuthScopes(authContext: { user: unknown; session: unknown }): string[] {
	const scopes: string[] = [];

	// 1. Check API key permissions (if using API key auth)
	const session = authContext.session as Record<string, unknown>;
	const apiKeyPermissions = session.permissions as Record<string, string[]> | undefined;

	if (apiKeyPermissions) {
		for (const [resource, actions] of Object.entries(apiKeyPermissions)) {
			for (const action of actions) {
				scopes.push(`${resource}:${action}`);
			}
		}
	}

	// 2. Check for flat scopes on session or user
	const user = authContext.user as Record<string, unknown>;
	const sessionScopes = session.scopes as string[] | string | undefined;
	const userScopes = user.scopes as string[] | string | undefined;

	const flatScopes = sessionScopes ?? userScopes;
	if (flatScopes) {
		if (Array.isArray(flatScopes)) {
			scopes.push(...flatScopes);
		} else if (typeof flatScopes === 'string') {
			scopes.push(...flatScopes.split(/\s+/).filter(Boolean));
		}
	}

	// 3. Add org role as a scope (e.g., 'org:owner', 'org:admin', 'org:member')
	const activeOrgRole = user.activeOrganizationRole as string | undefined;
	if (activeOrgRole) {
		scopes.push(`org:${activeOrgRole}`);
		// Owner gets admin privileges
		if (activeOrgRole === 'owner') {
			scopes.push('org:admin');
		}
	}

	return scopes;
}

/**
 * Async scope extractor that verifies API key to get permissions.
 * Use this for routes that need to check API key permissions.
 */
async function extractScopesWithApiKeyVerification(
	authContext: { user: unknown; session: unknown },
	apiKeyHeader: string | undefined
): Promise<string[]> {
	const scopes = extractBetterAuthScopes(authContext);

	// If we have an API key header and no permissions yet, verify it
	if (apiKeyHeader && scopes.length === 0) {
		try {
			const result = await auth.api.verifyApiKey({
				body: { key: apiKeyHeader },
			});
			if (result.valid && result.key?.permissions) {
				const permissions = result.key.permissions as Record<string, string[]>;
				for (const [resource, actions] of Object.entries(permissions)) {
					for (const action of actions) {
						scopes.push(`${resource}:${action}`);
					}
				}
			}
		} catch {
			// Verification failed, return scopes as-is
		}
	}

	return scopes;
}

// Example: Protected route with scope requirements using custom extractor
api.get(
	'/admin',
	authMiddleware,
	requireScopes(['org:admin'], { getScopes: extractBetterAuthScopes }),
	async (c) => {
		const user = await c.var.auth.getUser();
		return c.json({
			message: 'Welcome to the admin area!',
			userId: user.id,
		});
	}
);

// Example: Protected route requiring API key permission
// Uses custom async middleware since API key permissions require verification
api.post('/projects', authMiddleware, async (c, next) => {
	const authContext = c.var.auth.raw as { user: unknown; session: unknown };
	const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');
	const scopes = await extractScopesWithApiKeyVerification(authContext, apiKeyHeader);

	const requiredScope = 'project:write';
	const hasScope = scopes.includes(requiredScope) || scopes.includes('*');

	if (!hasScope) {
		return c.json({ error: 'Forbidden', missingScopes: [requiredScope] }, 403);
	}

	return next();
}, async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		message: 'Project creation authorized',
		userId: user.id,
	});
});

// Debug route to see current scopes (useful for testing scope configuration)
api.get('/debug/scopes', authMiddleware, async (c) => {
	const authContext = c.var.auth.raw as { user: unknown; session: unknown };
	const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');
	const scopes = await extractScopesWithApiKeyVerification(authContext, apiKeyHeader);
	const user = authContext.user as Record<string, unknown>;

	return c.json({
		scopes,
		activeOrgRole: user.activeOrganizationRole ?? null,
		authMethod: apiKeyHeader ? 'api-key' : 'session',
	});
});

// =============================================================================
// API Key Plugin Examples
// =============================================================================

// Create an API key for the authenticated user
// Supports optional permissions: { permissions: { project: ['read', 'write'] } }
// Note: BetterAuth requires permissions to be set server-side with userId, not via headers
api.post('/api-keys', authMiddleware, async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const name = body.name ?? 'default-key';
	const permissions = body.permissions as Record<string, string[]> | undefined;

	// Get the current user to pass userId for server-side API key creation
	const user = await c.var.auth.getUser();

	// Use BetterAuth's API to create an API key
	// When setting permissions, we must use server-side mode (with userId, not headers)
	const result = await auth.api.createApiKey({
		body: {
			name,
			userId: user.id, // Server-side mode: use userId instead of headers
			expiresIn: 60 * 60 * 24 * 30, // 30 days
			...(permissions && { permissions }),
		},
	});

	return c.json({
		id: result.id,
		name: result.name,
		key: result.key, // Only shown once - user must save this
		keyPreview: result.key?.slice(0, 10) + '...',
		expiresAt: result.expiresAt,
		permissions: permissions ?? null,
	});
});

// List API keys for the authenticated user
api.get('/api-keys', authMiddleware, async (c) => {
	const result = await auth.api.listApiKeys({
		headers: c.req.raw.headers,
	});

	return c.json(result);
});

// Revoke an API key
api.delete('/api-keys/:id', authMiddleware, async (c) => {
	const id = c.req.param('id');

	await auth.api.deleteApiKey({
		body: { keyId: id },
		headers: c.req.raw.headers,
	});

	return c.json({ success: true, message: 'API key revoked' });
});

// =============================================================================
// JWT Plugin Examples
// =============================================================================

// Get a JWT token for the authenticated user
api.get('/jwt', authMiddleware, async (c) => {
	const token = await c.var.auth.getToken();
	const url = new URL(c.req.url);

	return c.json({
		token,
		jwksUrl: `${url.origin}/api/auth/.well-known/jwks.json`,
		usage: 'Use this token in Authorization: Bearer <token> header',
	});
});

// =============================================================================
// Bearer Plugin Examples
// =============================================================================

// Example of how to use Bearer token authentication
// This route returns documentation on how Bearer auth works
api.get('/bearer-info', (c) => {
	return c.json({
		description: 'Bearer authentication allows using JWT tokens in Authorization header',
		usage: {
			step1: 'Sign in via /api/auth/sign-in/email to get session cookie',
			step2: 'GET /api/jwt to retrieve your JWT token',
			step3: 'Use token in requests: Authorization: Bearer <token>',
		},
		example: {
			curl: 'curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/me',
		},
		note: 'The /api/me endpoint already supports both session cookies and Bearer tokens',
	});
});

// =============================================================================
// Organization Plugin Examples
// =============================================================================

// Create a new organization
api.post('/organizations', authMiddleware, async (c) => {
	const body = await c.req.json();
	const { name, slug } = body;

	if (!name || !slug) {
		return c.json({ error: 'name and slug are required' }, 400);
	}

	try {
		const result = await auth.api.createOrganization({
			body: { name, slug },
			headers: c.req.raw.headers,
		});

		return c.json(result);
	} catch (err) {
		console.error('[Org] createOrganization failed', err);

		if (err instanceof APIError) {
			return c.json(
				{
					error: err.message,
					status: err.status,
					code: (err as APIError & { code?: string }).code,
				},
				err.status as 400 | 401 | 403 | 404 | 409 | 500
			);
		}

		return c.json({ error: 'Internal server error', detail: String(err) }, 500);
	}
});

// List organizations for the authenticated user
api.get('/organizations', authMiddleware, async (c) => {
	const result = await auth.api.listOrganizations({
		headers: c.req.raw.headers,
	});

	return c.json(result);
});

// Get the currently active organization
api.get('/organizations/active', authMiddleware, async (c) => {
	const result = await auth.api.getFullOrganization({
		headers: c.req.raw.headers,
	});

	return c.json(result ?? { message: 'No active organization' });
});

// Set the active organization
api.post('/organizations/:id/activate', authMiddleware, async (c) => {
	const organizationId = c.req.param('id');

	const result = await auth.api.setActiveOrganization({
		body: { organizationId },
		headers: c.req.raw.headers,
	});

	return c.json(result);
});

// Invite a member to an organization
api.post('/organizations/:id/invitations', authMiddleware, async (c) => {
	const organizationId = c.req.param('id');
	const body = await c.req.json();
	const { email, role } = body;

	if (!email) {
		return c.json({ error: 'email is required' }, 400);
	}

	const result = await auth.api.createInvitation({
		body: {
			organizationId,
			email,
			role: role ?? 'member',
		},
		headers: c.req.raw.headers,
	});

	return c.json(result);
});

// List members of an organization
api.get('/organizations/:id/members', authMiddleware, async (c) => {
	const organizationId = c.req.param('id');

	// First activate the org to access its members
	await auth.api.setActiveOrganization({
		body: { organizationId },
		headers: c.req.raw.headers,
	});

	const result = await auth.api.getFullOrganization({
		headers: c.req.raw.headers,
	});

	return c.json(result?.members ?? []);
});

// Get current user with organization context
api.get('/whoami', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();

	let activeOrg = null;
	try {
		activeOrg = await auth.api.getFullOrganization({
			headers: c.req.raw.headers,
		});
	} catch {
		// No active org
	}

	return c.json({
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
		},
		organization: activeOrg
			? {
					id: activeOrg.id,
					name: activeOrg.name,
					slug: activeOrg.slug,
					role: activeOrg.members?.find((m: { userId: string }) => m.userId === user.id)?.role,
				}
			: null,
	});
});

export default api;
