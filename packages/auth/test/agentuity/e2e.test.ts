/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * End-to-end tests for Agentuity BetterAuth integration.
 *
 * These tests verify the complete auth flow using mocked BetterAuth responses.
 */

import { describe, test, expect, mock } from 'bun:test';
import { Hono } from 'hono';
import { createMiddleware } from '../../src/agentuity/server';

describe('Agentuity BetterAuth E2E flow', () => {
	const mockUser = {
		id: 'user_e2e_123',
		name: 'E2E Test User',
		email: 'e2e@example.com',
		emailVerified: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	const mockSession = {
		id: 'session_e2e_456',
		token: 'e2e_session_token_abc123',
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
		userId: mockUser.id,
		scopes: ['read', 'write'],
	};

	const createMockAuth = (sessionResult: unknown) => ({
		api: {
			getSession: mock(() => Promise.resolve(sessionResult)),
		},
	});

	describe('Public routes (no middleware)', () => {
		test('public route works without auth middleware', async () => {
			const app = new Hono();
			app.get('/health', (c) => c.json({ status: 'ok' }));

			const res = await app.request('/health');
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ status: 'ok' });
		});
	});

	describe('Protected routes', () => {
		test('authenticated user can access protected routes', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createMiddleware(mockAuth as any));
			app.get('/api/me', async (c) => {
				const user = await c.var.auth.getUser();
				return c.json({
					id: user.id,
					name: user.name,
					email: user.email,
				});
			});

			const res = await app.request('/api/me');

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				id: 'user_e2e_123',
				name: 'E2E Test User',
				email: 'e2e@example.com',
			});
		});

		test('unauthenticated user gets 401 on protected routes', async () => {
			const mockAuth = createMockAuth(null);
			const app = new Hono();

			app.use('/api/*', createMiddleware(mockAuth as any));
			app.get('/api/me', async (c) => {
				const user = await c.var.auth.getUser();
				return c.json({ id: user.id });
			});

			const res = await app.request('/api/me');

			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: 'Unauthorized' });
		});
	});

	describe('Optional auth routes', () => {
		test('anonymous request works with optional auth', async () => {
			const mockAuth = createMockAuth(null);
			const app = new Hono();

			app.use('/greeting', createMiddleware(mockAuth as any, { optional: true }));
			app.get('/greeting', async (c) => {
				const user = c.var.user;
				if (user) {
					return c.json({ message: `Hello, ${(user as any).name}!` });
				}
				return c.json({ message: 'Hello, anonymous!' });
			});

			const res = await app.request('/greeting');
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ message: 'Hello, anonymous!' });
		});

		test('authenticated request works with optional auth', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/greeting', createMiddleware(mockAuth as any, { optional: true }));
			app.get('/greeting', async (c) => {
				const user = c.var.user;
				if (user) {
					return c.json({ message: `Hello, ${(user as any).name}!` });
				}
				return c.json({ message: 'Hello, anonymous!' });
			});

			const res = await app.request('/greeting');
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ message: 'Hello, E2E Test User!' });
		});
	});



	describe('Auth method detection', () => {
		test('detects session-based auth', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createMiddleware(mockAuth as any));
			app.get('/api/me', async (c) => {
				const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');
				const authMethod = apiKeyHeader ? 'api-key' : 'session';
				return c.json({ authMethod });
			});

			const res = await app.request('/api/me');

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ authMethod: 'session' });
		});

		test('detects API key auth via x-api-key header', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createMiddleware(mockAuth as any));
			app.get('/api/me', async (c) => {
				const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');
				const authMethod = apiKeyHeader ? 'api-key' : 'session';
				return c.json({ authMethod });
			});

			const res = await app.request('/api/me', {
				headers: { 'x-api-key': 'ag_test_key_12345' },
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ authMethod: 'api-key' });
		});
	});

	describe('Token extraction', () => {
		test('extracts bearer token from Authorization header', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createMiddleware(mockAuth as any));
			app.get('/api/token', async (c) => {
				const token = await c.var.auth.getToken();
				return c.json({ token });
			});

			const res = await app.request('/api/token', {
				headers: { Authorization: 'Bearer my-jwt-token-12345' },
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ token: 'my-jwt-token-12345' });
		});

		test('returns null when no Authorization header', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createMiddleware(mockAuth as any));
			app.get('/api/token', async (c) => {
				const token = await c.var.auth.getToken();
				return c.json({ token });
			});

			const res = await app.request('/api/token');

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ token: null });
		});
	});

	describe('Raw session data access', () => {
		test('exposes raw user and session on auth.raw', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createMiddleware(mockAuth as any));
			app.get('/api/session', async (c) => {
				return c.json({
					userId: c.var.auth.raw.user.id,
					sessionId: c.var.auth.raw.session.id,
					sessionToken: c.var.auth.raw.session.token,
				});
			});

			const res = await app.request('/api/session');

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				userId: 'user_e2e_123',
				sessionId: 'session_e2e_456',
				sessionToken: 'e2e_session_token_abc123',
			});
		});
	});



	describe('Full app simulation', () => {
		test('simulates complete app with multiple route types', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			// Public route - no middleware
			app.get('/health', (c) => c.json({ status: 'ok' }));

			// Protected routes
			app.use('/api/*', createMiddleware(mockAuth as any));

			app.get('/api/me', async (c) => {
				const user = await c.var.auth.getUser();
				return c.json({ id: user.id, name: user.name });
			});

			app.get('/api/data', (c) => c.json({ data: 'allowed' }));

			// Test all routes
			const healthRes = await app.request('/health');
			expect(healthRes.status).toBe(200);
			expect(await healthRes.json()).toEqual({ status: 'ok' });

			const meRes = await app.request('/api/me');
			expect(meRes.status).toBe(200);
			expect(await meRes.json()).toEqual({ id: 'user_e2e_123', name: 'E2E Test User' });

			const dataRes = await app.request('/api/data');
			expect(dataRes.status).toBe(200);
			expect(await dataRes.json()).toEqual({ data: 'allowed' });
		});
	});
});
