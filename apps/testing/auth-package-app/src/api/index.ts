/**
 * Auth Package Test API Routes
 *
 * This file demonstrates all @agentuity/auth features with example curl commands.
 *
 * SETUP:
 * 1. Start server: bun run dev
 * 2. Sign in first to get session cookie:
 *    curl -X POST http://localhost:3500/api/auth/sign-in/email \
 *      -H "Content-Type: application/json" \
 *      -d '{"email":"your@email.com","password":"yourpassword"}' \
 *      -c cookies.txt -b cookies.txt
 *
 * 3. Use -b cookies.txt with subsequent requests to authenticate
 */

import { createRouter } from '@agentuity/runtime';
import { mountAuthRoutes, createSessionMiddleware, createApiKeyMiddleware } from '@agentuity/auth';
import { APIError } from 'better-auth/api';
import { validator } from 'hono/validator';
import hello from '@agent/hello';
import { auth } from '../auth';
import * as schemas from './schemas';

const api = createRouter();

// Mount auth routes (sign-in, sign-up, sign-out, session, token, etc.)
api.on(['GET', 'POST'], '/auth/*', mountAuthRoutes(auth));

// =============================================================================
// Public Routes
// =============================================================================

/**
 * Health check - no auth required
 * curl http://localhost:3500/api/health
 */
api.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Hello agent - optional auth
 * curl -X POST http://localhost:3500/api/hello \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"World","wantPoem":false}' \
 *   -b cookies.txt
 */
api.post(
	'/hello',
	createSessionMiddleware(auth, { optional: true }),
	hello.validator(),
	async (c) => {
		const data = c.req.valid('json');
		const result = await hello.run(data);
		return c.json(result);
	}
);

// =============================================================================
// User Authentication Routes
// =============================================================================

/**
 * Get current user - requires auth
 * curl http://localhost:3500/api/me -b cookies.txt
 */
api.get('/me', createSessionMiddleware(auth), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		id: user.id,
		name: user.name,
		email: user.email,
	});
});

/**
 * Greeting - works for both authenticated and anonymous users
 * curl http://localhost:3500/api/greeting -b cookies.txt
 * curl http://localhost:3500/api/greeting  # anonymous
 */
api.get('/greeting', createSessionMiddleware(auth, { optional: true }), async (c) => {
	try {
		const user = await c.var.auth.getUser();
		return c.json({ message: `Hello, ${user.name || user.email}!` });
	} catch {
		return c.json({ message: 'Hello, anonymous user!' });
	}
});

/**
 * Get current user with organization context
 * curl http://localhost:3500/api/whoami -b cookies.txt
 */
api.get('/whoami', createSessionMiddleware(auth), async (c) => {
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

/**
 * Get auth token preview
 * curl http://localhost:3500/api/token -b cookies.txt
 */
api.get('/token', createSessionMiddleware(auth), async (c) => {
	const token = await c.var.auth.getToken();
	return c.json({
		hasToken: token !== null,
		tokenPreview: token ? `${token.slice(0, 10)}...` : null,
	});
});

// =============================================================================
// Organization Role-Based Access Control
// =============================================================================

/**
 * Admin-only route - requires owner or admin role
 * curl http://localhost:3500/api/admin -b cookies.txt
 */
api.get('/admin', createSessionMiddleware(auth, { hasOrgRole: ['owner', 'admin'] }), async (c) => {
	const user = await c.var.auth.getUser();
	const org = await c.var.auth.getOrg();

	return c.json({
		message: 'Welcome to the admin area!',
		userId: user.id,
		role: org?.role,
	});
});

/**
 * Debug current auth state
 * curl http://localhost:3500/api/debug/permissions -b cookies.txt
 */
api.get('/debug/permissions', createSessionMiddleware(auth), async (c) => {
	const org = await c.var.auth.getOrg();

	return c.json({
		permissions: c.var.auth.apiKey?.permissions ?? null,
		activeOrgRole: org?.role ?? null,
		authMethod: c.var.auth.authMethod,
	});
});

/**
 * Check if user has specific permissions
 * curl -X POST http://localhost:3500/api/debug/check-permission \
 *   -H "Content-Type: application/json" \
 *   -d '{"permissions":{"organization":["update"]}}' \
 *   -b cookies.txt
 */
api.post('/debug/check-permission', createSessionMiddleware(auth), async (c) => {
	const body = await c.req.json();
	const { permissions } = body;

	if (!permissions || typeof permissions !== 'object') {
		return c.json({ error: 'permissions object is required' }, 400);
	}

	try {
		const result = await auth.api.hasPermission({
			body: { permissions },
			headers: c.req.raw.headers,
		});

		return c.json(result);
	} catch (err) {
		if (err instanceof APIError) {
			return c.json(
				{ error: err.message, status: err.status },
				err.status as 400 | 401 | 403 | 404 | 500
			);
		}
		return c.json({ error: 'Internal server error' }, 500);
	}
});

// =============================================================================
// API Key Management
// =============================================================================

/**
 * Create an API key
 * curl -X POST http://localhost:3500/api/api-keys \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"my-key","permissions":{"project":["read","write"]}}' \
 *   -b cookies.txt
 */
api.post(
	'/api-keys',
	createSessionMiddleware(auth),
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
		const user = await c.var.auth.getUser();

		const result = await auth.api.createApiKey({
			body: {
				name,
				userId: user.id,
				expiresIn: 60 * 60 * 24 * 30, // 30 days
				...(permissions && { permissions }),
			},
		});

		return c.json({
			id: result.id,
			name: result.name,
			key: result.key, // Only shown once!
			keyPreview: result.key?.slice(0, 10) + '...',
			expiresAt: result.expiresAt,
			permissions: permissions ?? null,
		});
	}
);

/**
 * List API keys
 * curl http://localhost:3500/api/api-keys -b cookies.txt
 */
api.get('/api-keys', createSessionMiddleware(auth), async (c) => {
	const result = await auth.api.listApiKeys({
		headers: c.req.raw.headers,
	});
	return c.json(result);
});

/**
 * Delete an API key
 * curl -X DELETE http://localhost:3500/api/api-keys/KEY_ID -b cookies.txt
 */
api.delete('/api-keys/:id', createSessionMiddleware(auth), async (c) => {
	const id = c.req.param('id');
	await auth.api.deleteApiKey({
		body: { keyId: id },
		headers: c.req.raw.headers,
	});
	return c.json({ success: true, message: 'API key revoked' });
});

/**
 * Protected route requiring API key with project:write permission
 * curl -X POST http://localhost:3500/api/projects \
 *   -H "x-agentuity-auth-api-key: YOUR_API_KEY"
 */
api.post(
	'/projects',
	createApiKeyMiddleware(auth, { hasPermission: { project: 'write' } }),
	async (c) => {
		const user = c.var.user;
		return c.json({
			message: 'Project creation authorized',
			userId: user?.id ?? 'unknown',
			usedPermissions: c.var.auth.apiKey?.permissions ?? {},
		});
	}
);

// =============================================================================
// JWT & Bearer Token
// =============================================================================

/**
 * Get JWT token for Bearer auth
 * curl http://localhost:3500/api/jwt -b cookies.txt
 */
api.get('/jwt', createSessionMiddleware(auth), async (c) => {
	const token = await c.var.auth.getToken();
	const url = new URL(c.req.url);

	return c.json({
		token,
		jwksUrl: `${url.origin}/api/auth/.well-known/jwks.json`,
		usage: 'Use this token in Authorization: Bearer <token> header',
	});
});

/**
 * Bearer auth documentation
 * curl http://localhost:3500/api/bearer-info
 */
api.get('/bearer-info', (c) => {
	return c.json({
		description: 'Bearer authentication allows using JWT tokens in Authorization header',
		usage: {
			step1: 'Sign in via /api/auth/sign-in/email to get session cookie',
			step2: 'GET /api/jwt to retrieve your JWT token',
			step3: 'Use token in requests: Authorization: Bearer <token>',
		},
		example: {
			curl: 'curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3500/api/me',
		},
	});
});

// =============================================================================
// Organization CRUD
// =============================================================================

/**
 * Create organization
 * curl -X POST http://localhost:3500/api/organizations \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"My Org","slug":"my-org"}' \
 *   -b cookies.txt
 */
api.post(
	'/organizations',
	createSessionMiddleware(auth),
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
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status, code: (err as APIError & { code?: string }).code },
					err.status as 400 | 401 | 403 | 404 | 409 | 500
				);
			}
			return c.json({ error: 'Internal server error', detail: String(err) }, 500);
		}
	}
);

/**
 * List organizations
 * curl http://localhost:3500/api/organizations -b cookies.txt
 */
api.get('/organizations', createSessionMiddleware(auth), async (c) => {
	const result = await auth.api.listOrganizations({
		headers: c.req.raw.headers,
	});
	return c.json(result);
});

/**
 * Get active organization
 * curl http://localhost:3500/api/organizations/active -b cookies.txt
 */
api.get('/organizations/active', createSessionMiddleware(auth), async (c) => {
	const result = await auth.api.getFullOrganization({
		headers: c.req.raw.headers,
	});
	return c.json(result ?? { message: 'No active organization' });
});

/**
 * Check if slug is available
 * curl "http://localhost:3500/api/organizations/check-slug?slug=my-org" -b cookies.txt
 */
api.get('/organizations/check-slug', createSessionMiddleware(auth), async (c) => {
	const slug = c.req.query('slug');
	if (!slug) {
		return c.json({ error: 'slug query parameter is required' }, 400);
	}

	const result = await auth.api.checkOrganizationSlug({
		body: { slug },
		headers: c.req.raw.headers,
	});
	return c.json({ slug, available: !result.status });
});

/**
 * Get active member info
 * curl http://localhost:3500/api/organizations/active/member -b cookies.txt
 */
api.get('/organizations/active/member', createSessionMiddleware(auth), async (c) => {
	const member = await auth.api.getActiveMember({
		headers: c.req.raw.headers,
	});
	if (!member) {
		return c.json({ message: 'No active organization or member' });
	}
	return c.json(member);
});

/**
 * Get active member role
 * curl http://localhost:3500/api/organizations/active/role -b cookies.txt
 */
api.get('/organizations/active/role', createSessionMiddleware(auth), async (c) => {
	const result = await auth.api.getActiveMemberRole({
		headers: c.req.raw.headers,
	});
	return c.json(result);
});

/**
 * Get organization by ID
 * curl http://localhost:3500/api/organizations/ORG_ID -b cookies.txt
 */
api.get('/organizations/:id', createSessionMiddleware(auth), async (c) => {
	const organizationId = c.req.param('id');
	const result = await auth.api.getFullOrganization({
		query: { organizationId },
		headers: c.req.raw.headers,
	});
	return c.json(result ?? { error: 'Organization not found' });
});

/**
 * Activate organization
 * curl -X POST http://localhost:3500/api/organizations/ORG_ID/activate -b cookies.txt
 */
api.post('/organizations/:id/activate', createSessionMiddleware(auth), async (c) => {
	const organizationId = c.req.param('id');
	const result = await auth.api.setActiveOrganization({
		body: { organizationId },
		headers: c.req.raw.headers,
	});
	return c.json(result);
});

/**
 * Update organization (requires owner/admin)
 * curl -X PATCH http://localhost:3500/api/organizations/ORG_ID \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"Updated Name","metadata":{"tier":"pro"}}' \
 *   -b cookies.txt
 */
api.patch(
	'/organizations/:id',
	createSessionMiddleware(auth, { hasOrgRole: ['owner', 'admin'] }),
	validator('json', (value, c) => {
		const result = schemas.updateOrgInput['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const organizationId = c.req.param('id');
		const data = c.req.valid('json');

		try {
			const result = await auth.api.updateOrganization({
				body: { organizationId, data },
				headers: c.req.raw.headers,
			});
			return c.json(result);
		} catch (err) {
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status },
					err.status as 400 | 401 | 403 | 404 | 500
				);
			}
			return c.json({ error: 'Internal server error' }, 500);
		}
	}
);

/**
 * Delete organization (requires owner)
 * curl -X DELETE http://localhost:3500/api/organizations/ORG_ID -b cookies.txt
 */
api.delete(
	'/organizations/:id',
	createSessionMiddleware(auth, { hasOrgRole: ['owner'] }),
	async (c) => {
		const organizationId = c.req.param('id');

		try {
			const result = await auth.api.deleteOrganization({
				body: { organizationId },
				headers: c.req.raw.headers,
			});
			return c.json(result);
		} catch (err) {
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status },
					err.status as 400 | 401 | 403 | 404 | 500
				);
			}
			return c.json({ error: 'Internal server error' }, 500);
		}
	}
);

/**
 * Leave organization
 * curl -X POST http://localhost:3500/api/organizations/ORG_ID/leave -b cookies.txt
 */
api.post('/organizations/:id/leave', createSessionMiddleware(auth), async (c) => {
	const organizationId = c.req.param('id');

	try {
		const result = await auth.api.leaveOrganization({
			body: { organizationId },
			headers: c.req.raw.headers,
		});
		return c.json(result);
	} catch (err) {
		if (err instanceof APIError) {
			return c.json(
				{ error: err.message, status: err.status },
				err.status as 400 | 401 | 403 | 404 | 500
			);
		}
		return c.json({ error: 'Internal server error' }, 500);
	}
});

// =============================================================================
// Member Management
// =============================================================================

/**
 * List organization members
 * curl "http://localhost:3500/api/organizations/ORG_ID/members?limit=10" -b cookies.txt
 */
api.get('/organizations/:id/members', createSessionMiddleware(auth), async (c) => {
	const organizationId = c.req.param('id');
	const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
	const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined;

	const result = await auth.api.listMembers({
		query: { organizationId, limit, offset },
		headers: c.req.raw.headers,
	});
	return c.json(result);
});

/**
 * Add member directly (requires owner/admin)
 * curl -X POST http://localhost:3500/api/organizations/ORG_ID/members \
 *   -H "Content-Type: application/json" \
 *   -d '{"userId":"USER_ID","role":"member"}' \
 *   -b cookies.txt
 */
api.post(
	'/organizations/:id/members',
	createSessionMiddleware(auth, { hasOrgRole: ['owner', 'admin'] }),
	async (c) => {
		const organizationId = c.req.param('id');
		const body = await c.req.json();
		const { userId, role } = body;

		if (!userId) {
			return c.json({ error: 'userId is required' }, 400);
		}

		try {
			const result = await auth.api.addMember({
				body: { userId, role: role ?? 'member', organizationId },
			});
			return c.json(result);
		} catch (err) {
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status },
					err.status as 400 | 401 | 403 | 404 | 500
				);
			}
			return c.json({ error: 'Internal server error' }, 500);
		}
	}
);

/**
 * Remove member (requires owner/admin)
 * curl -X DELETE http://localhost:3500/api/organizations/ORG_ID/members/MEMBER_ID -b cookies.txt
 */
api.delete(
	'/organizations/:orgId/members/:memberId',
	createSessionMiddleware(auth, { hasOrgRole: ['owner', 'admin'] }),
	async (c) => {
		const organizationId = c.req.param('orgId');
		const memberIdOrEmail = c.req.param('memberId');

		try {
			const result = await auth.api.removeMember({
				body: { organizationId, memberIdOrEmail },
				headers: c.req.raw.headers,
			});
			return c.json(result);
		} catch (err) {
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status },
					err.status as 400 | 401 | 403 | 404 | 500
				);
			}
			return c.json({ error: 'Internal server error' }, 500);
		}
	}
);

/**
 * Update member role (requires owner/admin)
 * curl -X PATCH http://localhost:3500/api/organizations/ORG_ID/members/MEMBER_ID/role \
 *   -H "Content-Type: application/json" \
 *   -d '{"role":"admin"}' \
 *   -b cookies.txt
 */
api.patch(
	'/organizations/:orgId/members/:memberId/role',
	createSessionMiddleware(auth, { hasOrgRole: ['owner', 'admin'] }),
	validator('json', (value, c) => {
		const result = schemas.updateMemberRoleInput['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const organizationId = c.req.param('orgId');
		const memberId = c.req.param('memberId');
		const { role } = c.req.valid('json');

		try {
			const result = await auth.api.updateMemberRole({
				body: { organizationId, memberId, role },
				headers: c.req.raw.headers,
			});
			return c.json(result);
		} catch (err) {
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status },
					err.status as 400 | 401 | 403 | 404 | 500
				);
			}
			return c.json({ error: 'Internal server error' }, 500);
		}
	}
);

// =============================================================================
// Invitation Management
// =============================================================================

/**
 * Create invitation (requires owner/admin)
 * curl -X POST http://localhost:3500/api/organizations/ORG_ID/invitations \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"invite@example.com","role":"member"}' \
 *   -b cookies.txt
 */
api.post(
	'/organizations/:id/invitations',
	createSessionMiddleware(auth, { hasOrgRole: ['owner', 'admin'] }),
	validator('json', (value, c) => {
		const result = schemas.createInvitationInput['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const organizationId = c.req.param('id');
		const { email, role } = c.req.valid('json');

		try {
			const result = await auth.api.createInvitation({
				body: { organizationId, email, role: role ?? 'member' },
				headers: c.req.raw.headers,
			});
			return c.json(result);
		} catch (err) {
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status },
					err.status as 400 | 401 | 403 | 404 | 409 | 500
				);
			}
			return c.json({ error: 'Internal server error' }, 500);
		}
	}
);

/**
 * List organization invitations
 * curl http://localhost:3500/api/organizations/ORG_ID/invitations -b cookies.txt
 */
api.get('/organizations/:id/invitations', createSessionMiddleware(auth), async (c) => {
	const organizationId = c.req.param('id');
	const result = await auth.api.listInvitations({
		query: { organizationId },
		headers: c.req.raw.headers,
	});
	return c.json(result);
});

/**
 * List user's pending invitations
 * curl http://localhost:3500/api/me/invitations -b cookies.txt
 */
api.get('/me/invitations', createSessionMiddleware(auth), async (c) => {
	const result = await auth.api.listUserInvitations({
		headers: c.req.raw.headers,
	});
	return c.json(result);
});

/**
 * Get invitation details (only for recipient)
 * curl http://localhost:3500/api/invitations/INVITE_ID -b cookies.txt
 */
api.get('/invitations/:id', createSessionMiddleware(auth), async (c) => {
	const id = c.req.param('id');

	try {
		const result = await auth.api.getInvitation({
			query: { id },
			headers: c.req.raw.headers,
		});
		return c.json(result ?? { error: 'Invitation not found' });
	} catch (err) {
		const apiErr = err as { statusCode?: number; body?: { message?: string } };
		if (apiErr.statusCode && apiErr.body?.message) {
			return c.json(
				{ error: apiErr.body.message },
				apiErr.statusCode as 400 | 401 | 403 | 404 | 500
			);
		}
		if (err instanceof APIError) {
			return c.json(
				{ error: err.message, status: err.status },
				err.status as 400 | 401 | 403 | 404 | 500
			);
		}
		return c.json({ error: 'Internal server error', detail: String(err) }, 500);
	}
});

/**
 * Accept invitation
 * curl -X POST http://localhost:3500/api/invitations/INVITE_ID/accept -b cookies.txt
 */
api.post('/invitations/:id/accept', createSessionMiddleware(auth), async (c) => {
	const invitationId = c.req.param('id');

	try {
		const result = await auth.api.acceptInvitation({
			body: { invitationId },
			headers: c.req.raw.headers,
		});
		return c.json(result);
	} catch (err) {
		if (err instanceof APIError) {
			return c.json(
				{ error: err.message, status: err.status },
				err.status as 400 | 401 | 403 | 404 | 500
			);
		}
		return c.json({ error: 'Internal server error' }, 500);
	}
});

/**
 * Reject invitation
 * curl -X POST http://localhost:3500/api/invitations/INVITE_ID/reject -b cookies.txt
 */
api.post('/invitations/:id/reject', createSessionMiddleware(auth), async (c) => {
	const invitationId = c.req.param('id');

	try {
		const result = await auth.api.rejectInvitation({
			body: { invitationId },
			headers: c.req.raw.headers,
		});
		return c.json(result);
	} catch (err) {
		if (err instanceof APIError) {
			return c.json(
				{ error: err.message, status: err.status },
				err.status as 400 | 401 | 403 | 404 | 500
			);
		}
		return c.json({ error: 'Internal server error' }, 500);
	}
});

/**
 * Cancel invitation (requires owner/admin)
 * curl -X POST http://localhost:3500/api/invitations/INVITE_ID/cancel -b cookies.txt
 */
api.post(
	'/invitations/:id/cancel',
	createSessionMiddleware(auth, { hasOrgRole: ['owner', 'admin'] }),
	async (c) => {
		const invitationId = c.req.param('id');

		try {
			const result = await auth.api.cancelInvitation({
				body: { invitationId },
				headers: c.req.raw.headers,
			});
			return c.json(result);
		} catch (err) {
			if (err instanceof APIError) {
				return c.json(
					{ error: err.message, status: err.status },
					err.status as 400 | 401 | 403 | 404 | 500
				);
			}
			return c.json({ error: 'Internal server error' }, 500);
		}
	}
);

export default api;
