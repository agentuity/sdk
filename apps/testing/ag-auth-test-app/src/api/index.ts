import { createRouter } from '@agentuity/runtime';
import { mountAgentuityAuthRoutes } from '@agentuity/auth';
import { APIError } from 'better-auth/api';
import { validator } from 'hono/validator';
import hello from '@agent/hello';
import { auth, authMiddleware, optionalAuthMiddleware, apiKeyMiddleware } from '../auth';
import * as schemas from './schemas';

const api = createRouter();

// Mount auth routes (sign-in, sign-up, sign-out, session, token, etc.)
api.on(['GET', 'POST'], '/auth/*', mountAgentuityAuthRoutes(auth));

// Public route - no auth required
api.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Hello route with optional auth (to test withSession inside the agent)
api.post('/hello', optionalAuthMiddleware, hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

// Protected route - requires authentication (session or API key)
api.get('/me', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();

	return c.json({
		id: user.id,
		name: user.name,
		email: user.email,
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
// Uses the new ergonomic org helpers
api.get('/admin', authMiddleware, async (c) => {
	const hasAdminRole = await c.var.auth.hasOrgRole('owner', 'admin');

	if (!hasAdminRole) {
		return c.json({ error: 'Forbidden: admin role required' }, 403);
	}

	const user = await c.var.auth.getUser();
	const org = await c.var.auth.getOrg();

	return c.json({
		message: 'Welcome to the admin area!',
		userId: user.id,
		role: org?.role,
	});
});

// =============================================================================
// API Key Permission Examples (BetterAuth Native)
// =============================================================================

// Example: Protected route requiring API key permission
// Uses the new ergonomic API key helpers
api.post('/projects', apiKeyMiddleware, async (c) => {
	// Check for project:write permission using the new helper
	const canWriteProject = c.var.auth.hasPermission('project', 'write');

	if (!canWriteProject) {
		return c.json({ error: 'Forbidden', missingPermissions: { project: ['write'] } }, 403);
	}

	const user = c.var.user;
	return c.json({
		message: 'Project creation authorized',
		userId: user?.id ?? 'unknown',
		usedPermissions: c.var.auth.apiKey?.permissions ?? {},
	});
});

// Debug route to see current auth state (useful for testing)
// Uses the new ergonomic helpers
api.get('/debug/permissions', authMiddleware, async (c) => {
	const org = await c.var.auth.getOrg();

	return c.json({
		permissions: c.var.auth.apiKey?.permissions ?? null,
		activeOrgRole: org?.role ?? null,
		authMethod: c.var.auth.authMethod,
	});
});

// =============================================================================
// API Key Plugin Examples
// =============================================================================

// Create an API key for the authenticated user
// Supports optional permissions: { permissions: { project: ['read', 'write'] } }
// Note: BetterAuth requires permissions to be set server-side with userId, not via headers
api.post(
	'/api-keys',
	authMiddleware,
	validator('json', (value, c) => {
		const result = schemas.createApiKeyInput['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const body = c.req.valid('json');
		const name = body.name ?? 'default-key';
		const permissions = body.permissions;

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
	}
);

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
api.post(
	'/organizations',
	authMiddleware,
	validator('json', (value, c) => {
		const result = schemas.createOrgInput['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const body = c.req.valid('json');
		const { name, slug } = body;

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
	}
);

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
// Uses the new ergonomic helpers
api.get('/whoami', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();
	const org = await c.var.auth.getOrg();

	return c.json({
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
		},
		organization: org
			? {
					id: org.id,
					name: org.name,
					slug: org.slug,
					role: org.role,
				}
			: null,
	});
});

export default api;
