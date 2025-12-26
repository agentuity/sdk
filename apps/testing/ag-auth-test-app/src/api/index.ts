import { createRouter } from '@agentuity/runtime';
import { mountBetterAuthRoutes, requireScopes } from '@agentuity/auth/agentuity';
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

// Existing hello route
api.post('/hello', hello.validator(), async (c) => {
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

// Example: Protected route with scope requirements
// This shows how to use requireScopes middleware for fine-grained access control
api.get('/admin', authMiddleware, requireScopes(['admin']), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		message: 'Welcome to the admin area!',
		userId: user.id,
	});
});

// Example: Protected route requiring multiple scopes
api.post('/projects', authMiddleware, requireScopes(['project:write']), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		message: 'Project creation authorized',
		userId: user.id,
	});
});

// =============================================================================
// API Key Plugin Examples
// =============================================================================

// Create an API key for the authenticated user
api.post('/api-keys', authMiddleware, async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const name = body.name ?? 'default-key';

	// Use BetterAuth's API to create an API key
	const result = await auth.api.createApiKey({
		body: {
			name,
			expiresIn: 60 * 60 * 24 * 30, // 30 days
		},
		headers: c.req.raw.headers,
	});

	return c.json({
		id: result.id,
		name: result.name,
		key: result.key, // Only shown once - user must save this
		keyPreview: result.key?.slice(0, 10) + '...',
		expiresAt: result.expiresAt,
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

	const result = await auth.api.createOrganization({
		body: { name, slug },
		headers: c.req.raw.headers,
	});

	return c.json(result);
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
