/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, mock } from 'bun:test';
import { Hono } from 'hono';
import { createMiddleware, mountBetterAuthRoutes } from '../../src/agentuity/server';

const createMockAuth = (sessionResult: unknown) => ({
	api: {
		getSession: mock(() => Promise.resolve(sessionResult)),
	},
});

describe('Agentuity BetterAuth server middleware', () => {
	test('returns 401 when session is null', async () => {
		const mockAuth = createMockAuth(null);
		const app = new Hono();

		app.use('/protected', createMiddleware(mockAuth as any));
		app.get('/protected', (c) => c.json({ success: true }));

		const res = await app.request('/protected', {
			method: 'GET',
		});

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({ error: 'Unauthorized' });
	});

	test('returns 401 when getSession throws', async () => {
		const mockAuth = {
			api: {
				getSession: mock(() => Promise.reject(new Error('Session error'))),
			},
		};
		const app = new Hono();

		app.use('/protected', createMiddleware(mockAuth as any));
		app.get('/protected', (c) => c.json({ success: true }));

		const res = await app.request('/protected', {
			method: 'GET',
		});

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({ error: 'Unauthorized' });
	});

	test('allows request and attaches auth when session is valid', async () => {
		const mockSession = {
			user: {
				id: 'user_123',
				name: 'Test User',
				email: 'test@example.com',
			},
			session: {
				id: 'session_456',
				token: 'abc123',
			},
		};
		const mockAuth = createMockAuth(mockSession);
		const app = new Hono();

		app.use('/protected', createMiddleware(mockAuth as any));
		app.get('/protected', async (c) => {
			const user = await c.var.auth.getUser();
			return c.json({
				success: true,
				userId: user.id,
				userName: user.name,
				userEmail: user.email,
			});
		});

		const res = await app.request('/protected', {
			method: 'GET',
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({
			success: true,
			userId: 'user_123',
			userName: 'Test User',
			userEmail: 'test@example.com',
		});
	});

	test('caches user on multiple getUser calls', async () => {
		const mockSession = {
			user: { id: 'user_123', name: 'Test', email: 'test@example.com' },
			session: { id: 'session_456' },
		};
		const mockAuth = createMockAuth(mockSession);
		const app = new Hono();

		app.use('/protected', createMiddleware(mockAuth as any));
		app.get('/protected', async (c) => {
			const user1 = await c.var.auth.getUser();
			const user2 = await c.var.auth.getUser();
			return c.json({
				same: user1 === user2,
				userId: user1.id,
			});
		});

		const res = await app.request('/protected');
		const body = await res.json();
		expect(body.same).toBe(true);
		expect(body.userId).toBe('user_123');
	});

	test('getToken returns bearer token from Authorization header', async () => {
		const mockSession = {
			user: { id: 'user_123' },
			session: { id: 'session_456' },
		};
		const mockAuth = createMockAuth(mockSession);
		const app = new Hono();

		app.use('/protected', createMiddleware(mockAuth as any));
		app.get('/protected', async (c) => {
			const token = await c.var.auth.getToken();
			return c.json({ token });
		});

		const res = await app.request('/protected', {
			headers: { Authorization: 'Bearer my-token-123' },
		});

		const body = await res.json();
		expect(body.token).toBe('my-token-123');
	});

	test('getToken returns null when no Authorization header', async () => {
		const mockSession = {
			user: { id: 'user_123' },
			session: { id: 'session_456' },
		};
		const mockAuth = createMockAuth(mockSession);
		const app = new Hono();

		app.use('/protected', createMiddleware(mockAuth as any));
		app.get('/protected', async (c) => {
			const token = await c.var.auth.getToken();
			return c.json({ token });
		});

		const res = await app.request('/protected');
		const body = await res.json();
		expect(body.token).toBe(null);
	});

	test('exposes raw session on auth.raw', async () => {
		const mockSession = {
			user: { id: 'user_123', customField: 'custom-value' },
			session: { id: 'session_456', expiresAt: '2024-12-31' },
		};
		const mockAuth = createMockAuth(mockSession);
		const app = new Hono();

		app.use('/protected', createMiddleware(mockAuth as any));
		app.get('/protected', async (c) => {
			return c.json({
				userId: c.var.auth.raw.user.id,
				sessionId: c.var.auth.raw.session.id,
				customField: c.var.auth.raw.user.customField,
			});
		});

		const res = await app.request('/protected');
		const body = await res.json();
		expect(body).toEqual({
			userId: 'user_123',
			sessionId: 'session_456',
			customField: 'custom-value',
		});
	});

	describe('optional mode', () => {
		test('allows unauthenticated requests when optional=true', async () => {
			const mockAuth = createMockAuth(null);
			const app = new Hono();

			app.use('/public', createMiddleware(mockAuth as any, { optional: true }));
			app.get('/public', (c) => {
				return c.json({
					hasAuth: c.var.auth !== undefined,
				});
			});

			const res = await app.request('/public');
			expect(res.status).toBe(200);
		});

		test('attaches auth when session exists in optional mode', async () => {
			const mockSession = {
				user: { id: 'user_123' },
				session: { id: 'session_456' },
			};
			const mockAuth = createMockAuth(mockSession);
			const app = new Hono();

			app.use('/public', createMiddleware(mockAuth as any, { optional: true }));
			app.get('/public', async (c) => {
				const user = await c.var.auth.getUser();
				return c.json({ userId: user.id });
			});

			const res = await app.request('/public');
			const body = await res.json();
			expect(body.userId).toBe('user_123');
		});

		test('sets user and session to null when unauthenticated in optional mode', async () => {
			const mockAuth = createMockAuth(null);
			const app = new Hono();

			app.use('/public', createMiddleware(mockAuth as any, { optional: true }));
			app.get('/public', (c) => {
				return c.json({
					user: c.var.user,
					session: c.var.session,
				});
			});

			const res = await app.request('/public');
			const body = await res.json();
			expect(body.user).toBe(null);
			expect(body.session).toBe(null);
		});
	});

	describe('BetterAuth pattern (user/session on context)', () => {
		test('sets user and session directly on context', async () => {
			const mockSession = {
				user: { id: 'user_123', name: 'Test', email: 'test@example.com' },
				session: { id: 'session_456', token: 'abc' },
			};
			const mockAuth = createMockAuth(mockSession);
			const app = new Hono();

			app.use('/api', createMiddleware(mockAuth as any));
			app.get('/api', (c) => {
				return c.json({
					userId: (c.var.user as any)?.id,
					sessionId: (c.var.session as any)?.id,
				});
			});

			const res = await app.request('/api');
			const body = await res.json();
			expect(body.userId).toBe('user_123');
			expect(body.sessionId).toBe('session_456');
		});
	});

	describe('organization enrichment', () => {
		test('provides minimal org from session and fetches full org lazily', async () => {
			const mockSession = {
				user: { id: 'user_123', name: 'Test' },
				session: {
					id: 'session_456',
					activeOrganizationId: 'org_789',
				},
			};
			const mockFullOrg = {
				id: 'org_789',
				name: 'Test Org',
				slug: 'test-org',
				metadata: null,
				members: [{ userId: 'user_123', role: 'admin', id: 'member_123' }],
			};
			const mockAuth = {
				api: {
					getSession: mock(() => Promise.resolve(mockSession)),
					getFullOrganization: mock(() => Promise.resolve(mockFullOrg)),
				},
			};
			const app = new Hono();

			app.use('/api', createMiddleware(mockAuth as any));
			app.get('/api', async (c) => {
				const user = c.var.user as any;
				const minimalOrg = c.var.org;
				const fullOrg = await c.var.auth.getOrg();
				return c.json({
					userId: user?.id,
					minimalOrgId: minimalOrg?.id,
					minimalOrgName: minimalOrg?.name,
					fullOrgId: fullOrg?.id,
					fullOrgName: fullOrg?.name,
					fullOrgSlug: fullOrg?.slug,
					fullOrgRole: fullOrg?.role,
				});
			});

			const res = await app.request('/api');
			const body = await res.json();
			expect(body.userId).toBe('user_123');
			expect(body.minimalOrgId).toBe('org_789');
			expect(body.minimalOrgName).toBeUndefined();
			expect(body.fullOrgId).toBe('org_789');
			expect(body.fullOrgName).toBe('Test Org');
			expect(body.fullOrgSlug).toBe('test-org');
			expect(body.fullOrgRole).toBe('admin');
		});

		test('returns null org when no activeOrganizationId in session', async () => {
			const mockSession = {
				user: { id: 'user_123' },
				session: { id: 'session_456' },
			};
			const mockAuth = createMockAuth(mockSession);
			const app = new Hono();

			app.use('/api', createMiddleware(mockAuth as any));
			app.get('/api', (c) => {
				const user = c.var.user as any;
				return c.json({
					userId: user?.id,
					hasOrg: c.var.org !== null,
				});
			});

			const res = await app.request('/api');
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.userId).toBe('user_123');
			expect(body.hasOrg).toBe(false);
		});
	});

	describe('API key detection', () => {
		test('detects x-api-key header', async () => {
			const mockSession = {
				user: { id: 'user_123' },
				session: { id: 'session_456' },
			};
			const mockAuth = createMockAuth(mockSession);
			const app = new Hono();

			app.use('/api', createMiddleware(mockAuth as any));
			app.get('/api', (c) => c.json({ success: true }));

			const res = await app.request('/api', {
				headers: { 'x-api-key': 'ak_test_123' },
			});

			expect(res.status).toBe(200);
		});

		test('detects Authorization: ApiKey header', async () => {
			const mockSession = {
				user: { id: 'user_123' },
				session: { id: 'session_456' },
			};
			const mockAuth = createMockAuth(mockSession);
			const app = new Hono();

			app.use('/api', createMiddleware(mockAuth as any));
			app.get('/api', (c) => c.json({ success: true }));

			const res = await app.request('/api', {
				headers: { Authorization: 'ApiKey ak_test_123' },
			});

			expect(res.status).toBe(200);
		});
	});
});

describe('mountBetterAuthRoutes', () => {

	test('forwards requests to auth handler', async () => {
		const mockHandler = mock(async (req: Request) => {
			return new Response(JSON.stringify({ path: new URL(req.url).pathname }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});
		const mockAuth = { handler: mockHandler };
		const app = new Hono();

		app.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(mockAuth as any));

		const res = await app.request('/auth/session');
		expect(res.status).toBe(200);
		expect(mockHandler).toHaveBeenCalled();
	});

	test('preserves Set-Cookie headers from auth handler', async () => {
		const mockHandler = mock(async () => {
			const headers = new Headers();
			headers.append('Set-Cookie', 'session=abc123; Path=/; HttpOnly');
			headers.append('Set-Cookie', 'csrf=xyz789; Path=/');
			return new Response('{"ok": true}', {
				status: 200,
				headers,
			});
		});
		const mockAuth = { handler: mockHandler };
		const app = new Hono();

		app.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(mockAuth as any));

		const res = await app.request('/auth/sign-in', { method: 'POST' });
		expect(res.status).toBe(200);

		const cookies = res.headers.getSetCookie();
		expect(cookies.length).toBeGreaterThanOrEqual(1);
	});

	test('returns response body from auth handler', async () => {
		const mockHandler = mock(async () => {
			return new Response(JSON.stringify({ user: { id: 'user_123' } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});
		const mockAuth = { handler: mockHandler };
		const app = new Hono();

		app.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(mockAuth as any));

		const res = await app.request('/auth/session');
		const body = await res.json();
		expect(body).toEqual({ user: { id: 'user_123' } });
	});

	test('preserves status code from auth handler', async () => {
		const mockHandler = mock(async () => {
			return new Response('{"error": "Unauthorized"}', {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		});
		const mockAuth = { handler: mockHandler };
		const app = new Hono();

		app.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(mockAuth as any));

		const res = await app.request('/auth/session');
		expect(res.status).toBe(401);
	});

	test('merges headers set by Hono middleware', async () => {
		const mockHandler = mock(async () => {
			return new Response('{"ok": true}', {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'X-Auth-Header': 'from-auth',
				},
			});
		});
		const mockAuth = { handler: mockHandler };
		const app = new Hono();

		app.use('/auth/*', async (c, next) => {
			c.header('X-Middleware-Header', 'from-middleware');
			await next();
		});
		app.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(mockAuth as any));

		const res = await app.request('/auth/session');
		expect(res.headers.get('X-Auth-Header')).toBe('from-auth');
		expect(res.headers.get('X-Middleware-Header')).toBe('from-middleware');
	});
});
