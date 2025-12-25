import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { createHonoMiddleware } from '../../src/agentuity/server';

const createMockAuth = (sessionResult: unknown) => ({
	api: {
		getSession: mock(() => Promise.resolve(sessionResult)),
	},
});

describe('Agentuity BetterAuth server middleware', () => {
	beforeEach(() => {
		// Reset any state if needed
	});

	test('returns 401 when session is null', async () => {
		const mockAuth = createMockAuth(null);
		const app = new Hono();

		app.use('/protected', createHonoMiddleware(mockAuth as any));
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

		app.use('/protected', createHonoMiddleware(mockAuth as any));
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

		app.use('/protected', createHonoMiddleware(mockAuth as any));
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

		app.use('/protected', createHonoMiddleware(mockAuth as any));
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

		app.use('/protected', createHonoMiddleware(mockAuth as any));
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

		app.use('/protected', createHonoMiddleware(mockAuth as any));
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

		app.use('/protected', createHonoMiddleware(mockAuth as any));
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

			app.use('/public', createHonoMiddleware(mockAuth as any, { optional: true }));
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

			app.use('/public', createHonoMiddleware(mockAuth as any, { optional: true }));
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

			app.use('/public', createHonoMiddleware(mockAuth as any, { optional: true }));
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

			app.use('/api', createHonoMiddleware(mockAuth as any));
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
});
