/**
 * End-to-end tests for Agentuity BetterAuth integration.
 *
 * These tests verify the complete auth flow using mocked BetterAuth responses.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { createHonoMiddleware } from '../../src/agentuity/server';
import { withAuth, createScopeChecker } from '../../src/agentuity/agent';
import type { AgentAuthContext } from '../../src/agentuity/agent';

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
	};

	const createMockAuth = (sessionResult: unknown) => ({
		api: {
			getSession: mock(() => Promise.resolve(sessionResult)),
		},
	});

	describe('Full authentication flow', () => {
		test('authenticated user can access protected routes', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createHonoMiddleware(mockAuth as any));

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
			const body = await res.json();
			expect(body).toEqual({
				id: 'user_e2e_123',
				name: 'E2E Test User',
				email: 'e2e@example.com',
			});
		});

		test('unauthenticated user gets 401 on protected routes', async () => {
			const mockAuth = createMockAuth(null);
			const app = new Hono();

			app.use('/api/*', createHonoMiddleware(mockAuth as any));
			app.get('/api/me', async (c) => {
				const user = await c.var.auth.getUser();
				return c.json({ id: user.id });
			});

			const res = await app.request('/api/me');

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({ error: 'Unauthorized' });
		});

		test('optional auth allows both authenticated and anonymous access', async () => {
			const app = new Hono();

			// Anonymous request
			const anonAuth = createMockAuth(null);
			app.use('/greeting', createHonoMiddleware(anonAuth as any, { optional: true }));
			app.get('/greeting', async (c) => {
				try {
					const user = await c.var.auth.getUser();
					return c.json({ message: `Hello, ${user.name}!` });
				} catch {
					return c.json({ message: 'Hello, anonymous!' });
				}
			});

			const anonRes = await app.request('/greeting');
			expect(anonRes.status).toBe(200);

			// Authenticated request
			const authApp = new Hono();
			const authedAuth = createMockAuth({ user: mockUser, session: mockSession });
			authApp.use('/greeting', createHonoMiddleware(authedAuth as any, { optional: true }));
			authApp.get('/greeting', async (c) => {
				try {
					const user = await c.var.auth.getUser();
					return c.json({ message: `Hello, ${user.name}!` });
				} catch {
					return c.json({ message: 'Hello, anonymous!' });
				}
			});

			const authRes = await authApp.request('/greeting');
			expect(authRes.status).toBe(200);
			const authBody = await authRes.json();
			expect(authBody).toEqual({ message: 'Hello, E2E Test User!' });
		});

		test('bearer token is extracted from Authorization header', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createHonoMiddleware(mockAuth as any));
			app.get('/api/token', async (c) => {
				const token = await c.var.auth.getToken();
				return c.json({ token });
			});

			const res = await app.request('/api/token', {
				headers: { Authorization: 'Bearer my-jwt-token-12345' },
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ token: 'my-jwt-token-12345' });
		});
	});

	describe('Agent auth context flow', () => {
		test('withAuth wrapper provides typed context to agents', async () => {
			const handler = withAuth(async (ctx, input: { action: string }) => {
				return {
					userId: ctx.auth?.user.id,
					action: input.action,
					hasReadScope: ctx.hasScope('read'),
				};
			});

			const ctx: AgentAuthContext = {
				auth: { user: mockUser, session: mockSession } as any,
				hasScope: createScopeChecker(['read', 'write']),
			};

			const result = await handler(ctx, { action: 'test' });

			expect(result).toEqual({
				userId: 'user_e2e_123',
				action: 'test',
				hasReadScope: true,
			});
		});

		test('scope checking works correctly with wildcards', async () => {
			const handler = withAuth(
				async (ctx, _input: {}) => {
					return {
						canRead: ctx.hasScope('read'),
						canWrite: ctx.hasScope('write'),
						canDelete: ctx.hasScope('delete'),
						canAdmin: ctx.hasScope('admin'),
					};
				},
				{ requiredScopes: [] }
			);

			// Test with wildcard scope
			const wildcardCtx: AgentAuthContext = {
				auth: { user: mockUser, session: mockSession } as any,
				hasScope: createScopeChecker(['*']),
			};

			const wildcardResult = await handler(wildcardCtx, {});
			expect(wildcardResult.canRead).toBe(true);
			expect(wildcardResult.canWrite).toBe(true);
			expect(wildcardResult.canDelete).toBe(true);
			expect(wildcardResult.canAdmin).toBe(true);

			// Test with limited scopes
			const limitedCtx: AgentAuthContext = {
				auth: { user: mockUser, session: mockSession } as any,
				hasScope: createScopeChecker(['read']),
			};

			const limitedResult = await handler(limitedCtx, {});
			expect(limitedResult.canRead).toBe(true);
			expect(limitedResult.canWrite).toBe(false);
		});
	});

	describe('Token and session flow', () => {
		test('raw session data is accessible', async () => {
			const mockAuth = createMockAuth({ user: mockUser, session: mockSession });
			const app = new Hono();

			app.use('/api/*', createHonoMiddleware(mockAuth as any));
			app.get('/api/session', async (c) => {
				return c.json({
					userId: c.var.auth.raw.user.id,
					sessionId: c.var.auth.raw.session.id,
					sessionToken: c.var.auth.raw.session.token,
				});
			});

			const res = await app.request('/api/session');

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				userId: 'user_e2e_123',
				sessionId: 'session_e2e_456',
				sessionToken: 'e2e_session_token_abc123',
			});
		});
	});
});
