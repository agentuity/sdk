import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { requireScopes } from '../../src/agentuity/server';

describe('requireScopes middleware', () => {
	const createApp = (authContext: unknown) => {
		const app = new Hono();

		// Mock auth middleware that sets c.var.auth
		app.use('*', async (c, next) => {
			c.set('auth', authContext);
			await next();
		});

		return app;
	};

	test('returns 401 when no auth context', async () => {
		const app = createApp(null);
		app.get('/test', requireScopes(['read']), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(401);
	});

	test('returns 401 when auth.raw is missing', async () => {
		const app = createApp({ getUser: async () => null });
		app.get('/test', requireScopes(['read']), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(401);
	});

	test('returns 403 when required scopes are missing', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123' },
				session: { scopes: ['read'] },
			},
		});
		app.get('/test', requireScopes(['write', 'admin']), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(403);

		const body = (await res.json()) as { error: string; missingScopes: string[] };
		expect(body.error).toBe('Forbidden');
		expect(body.missingScopes).toContain('write');
		expect(body.missingScopes).toContain('admin');
	});

	test('passes when all required scopes are present', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123' },
				session: { scopes: ['read', 'write', 'admin'] },
			},
		});
		app.get('/test', requireScopes(['read', 'write']), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	test('passes with wildcard scope', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123' },
				session: { scopes: ['*'] },
			},
		});
		app.get('/test', requireScopes(['anything', 'at', 'all']), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(200);
	});

	test('handles space-delimited scope string', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123' },
				session: { scopes: 'read write admin' },
			},
		});
		app.get('/test', requireScopes(['read', 'write']), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(200);
	});

	test('supports custom scope extraction', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123', permissions: ['custom:read', 'custom:write'] },
				session: {},
			},
		});
		app.get(
			'/test',
			requireScopes(['custom:read'], {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				getScopes: (auth) => (auth.user as any).permissions ?? [],
			}),
			(c) => c.json({ ok: true })
		);

		const res = await app.request('/test');
		expect(res.status).toBe(200);
	});

	test('supports custom unauthorized handler', async () => {
		const app = createApp(null);
		app.get(
			'/test',
			requireScopes(['read'], {
				onUnauthorized: (c) => c.json({ custom: 'unauthorized' }, 401),
			}),
			(c) => c.json({ ok: true })
		);

		const res = await app.request('/test');
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ custom: 'unauthorized' });
	});

	test('supports custom forbidden handler', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123' },
				session: { scopes: [] },
			},
		});
		app.get(
			'/test',
			requireScopes(['admin'], {
				onForbidden: (c, missing) => c.json({ custom: 'forbidden', missing }, 403),
			}),
			(c) => c.json({ ok: true })
		);

		const res = await app.request('/test');
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ custom: 'forbidden', missing: ['admin'] });
	});

	test('passes with empty required scopes', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123' },
				session: { scopes: [] },
			},
		});
		app.get('/test', requireScopes([]), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(200);
	});

	test('looks for scopes in user object as fallback', async () => {
		const app = createApp({
			raw: {
				user: { id: 'user_123', scopes: ['read', 'write'] },
				session: {},
			},
		});
		app.get('/test', requireScopes(['read']), (c) => c.json({ ok: true }));

		const res = await app.request('/test');
		expect(res.status).toBe(200);
	});
});
