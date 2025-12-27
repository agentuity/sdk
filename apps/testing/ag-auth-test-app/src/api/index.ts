import { createRouter } from '@agentuity/runtime';
import { mountBetterAuthRoutes } from '@agentuity/auth/agentuity';
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
// Organization Role-Based Access Control Examples
// =============================================================================

// Admin route - requires owner or admin role in the active organization
api.get('/admin', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();
	const activeOrg = await auth.api
		.getFullOrganization({
			headers: c.req.raw.headers,
		})
		.catch(() => null);

	const role = activeOrg?.members?.find((m: { userId: string }) => m.userId === user.id)?.role;

	if (role !== 'owner' && role !== 'admin') {
		return c.json({ error: 'Forbidden: admin role required' }, 403);
	}

	return c.json({
		message: 'Welcome to the admin area!',
		userId: user.id,
		role,
	});
});

// =============================================================================
// API Key Permission Examples (BetterAuth Native)
// =============================================================================

// Example: Protected route requiring API key permission
// Uses BetterAuth's native permissions: Record<string, string[]> format
api.post('/projects', authMiddleware, async (c) => {
	const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');

	if (!apiKeyHeader) {
		return c.json({ error: 'API key required for this endpoint' }, 401);
	}

	// Verify API key and check permissions using BetterAuth's native API
	try {
		const result = await auth.api.verifyApiKey({
			body: { key: apiKeyHeader },
		});

		if (!result.valid || !result.key?.permissions) {
			return c.json({ error: 'Invalid API key' }, 401);
		}

		const permissions = result.key.permissions as Record<string, string[]>;
		const projectPerms = permissions.project ?? [];
		const canWriteProject = projectPerms.includes('write') || projectPerms.includes('*');

		if (!canWriteProject) {
			return c.json(
				{ error: 'Forbidden', missingPermissions: { project: ['write'] } },
				403
			);
		}

		const user = await c.var.auth.getUser();
		return c.json({
			message: 'Project creation authorized',
			userId: user.id,
			usedPermissions: permissions,
		});
	} catch (err) {
		return c.json({ error: 'API key verification failed', detail: String(err) }, 500);
	}
});

// Debug route to see current API key permissions (useful for testing)
api.get('/debug/permissions', authMiddleware, async (c) => {
	const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');

	let permissions: Record<string, string[]> | null = null;

	if (apiKeyHeader) {
		try {
			const result = await auth.api.verifyApiKey({
				body: { key: apiKeyHeader },
			});
			if (result.valid && result.key?.permissions) {
				permissions = result.key.permissions as Record<string, string[]>;
			}
		} catch {
			// Verification failed, keep permissions as null
		}
	}

	const authContext = c.var.auth.raw as { user: unknown; session: unknown };
	const user = authContext.user as Record<string, unknown>;

	return c.json({
		permissions,
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
