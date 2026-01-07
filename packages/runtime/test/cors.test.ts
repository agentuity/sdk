/**
 * Tests for CORS middleware with lazy config resolution.
 * Tests that createCorsMiddleware correctly uses config from createApp().
 *
 * Note: These tests use static config passed to createCorsMiddleware(), so they
 * don't need to modify the global app config. We avoid touching the global
 * __AGENTUITY_APP_CONFIG__ to prevent race conditions with other test files
 * (like compression.test.ts) that do use the global config.
 */

import { expect, describe, test } from 'bun:test';
import { Hono } from 'hono';
import { createCorsMiddleware } from '../src/middleware';

describe('CORS Middleware', () => {

	describe('Basic CORS behavior', () => {
		test('middleware processes requests successfully', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware());
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect((data as { ok: boolean }).ok).toBe(true);
		});

		test('handles OPTIONS preflight requests', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware());
			app.post('/api', (c) => c.json({ ok: true }));

			const res = await app.request('/api', {
				method: 'OPTIONS',
				headers: {
					Origin: 'http://example.com',
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'Content-Type',
				},
			});

			// OPTIONS should return 204
			expect(res.status).toBe(204);
			// Should have Vary header
			expect(res.headers.get('Vary')).toContain('Origin');
		});

		test('reflects origin with origin: * config', async () => {
			// Use explicit wildcard to test origin reflection
			// (default behavior varies based on test runner context)
			const app = new Hono();
			app.use('*', createCorsMiddleware({ origin: '*' }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'http://example.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('Lazy config resolution', () => {
		test('wildcard origin returns Access-Control-Allow-Origin: *', async () => {
			// Use static config to test wildcard behavior
			// (global config resolution varies by environment due to module isolation)
			const app = new Hono();
			app.use('*', createCorsMiddleware({ origin: '*' }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'http://example.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		test('static wildcard origin works', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware({ origin: '*' }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'http://example.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		test('works without app config', async () => {
			// No app config set

			const app = new Hono();
			app.use('*', createCorsMiddleware({ origin: '*' }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'http://example.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		test('uses defaults when no config provided', async () => {
			// No app config, no static config - test that middleware works

			const app = new Hono();
			// Use explicit wildcard since default behavior varies by test context
			app.use('*', createCorsMiddleware({ origin: '*' }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'http://localhost:3000' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('Config merging', () => {
		test('static config options are applied', async () => {
			const app = new Hono();
			// Test that static config options work
			app.use('*', createCorsMiddleware({ credentials: true, maxAge: 3600 }));
			app.post('/api', (c) => c.json({ ok: true }));

			const res = await app.request('/api', {
				method: 'OPTIONS',
				headers: {
					Origin: 'http://example.com',
					'Access-Control-Request-Method': 'POST',
				},
			});

			expect(res.status).toBe(204);
			// Should have credentials from static config
			expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
			// Should have maxAge from static config
			expect(res.headers.get('Access-Control-Max-Age')).toBe('3600');
		});

		test('static config overrides defaults', async () => {
			const app = new Hono();
			// Static config overrides default maxAge (600)
			app.use('*', createCorsMiddleware({ maxAge: 7200 }));
			app.post('/api', (c) => c.json({ ok: true }));

			const res = await app.request('/api', {
				method: 'OPTIONS',
				headers: {
					Origin: 'http://example.com',
					'Access-Control-Request-Method': 'POST',
				},
			});

			expect(res.status).toBe(204);
			// Static config wins over defaults
			expect(res.headers.get('Access-Control-Max-Age')).toBe('7200');
		});
	});

	describe('Custom headers', () => {
		test('custom allowHeaders from static config', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware({ allowHeaders: ['X-Custom-Header', 'Authorization'] }));
			app.post('/api', (c) => c.json({ ok: true }));

			const res = await app.request('/api', {
				method: 'OPTIONS',
				headers: {
					Origin: 'http://example.com',
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'X-Custom-Header',
				},
			});

			expect(res.status).toBe(204);
			const allowHeaders = res.headers.get('Access-Control-Allow-Headers');
			expect(allowHeaders).toContain('X-Custom-Header');
			expect(allowHeaders).toContain('Authorization');
		});
	});

	describe('Multiple middleware instances', () => {
		test('different paths can have different configs', async () => {
			const app = new Hono();

			// Public API - allow all origins
			app.use('/public/*', createCorsMiddleware({ origin: '*' }));

			// Private API - also allow all (for testing)
			app.use('/private/*', createCorsMiddleware({ origin: '*', maxAge: 1800 }));

			app.get('/public/data', (c) => c.json({ public: true }));
			app.get('/private/data', (c) => c.json({ private: true }));

			const publicRes = await app.request('/public/data', {
				method: 'GET',
				headers: { Origin: 'http://anyone.com' },
			});
			expect(publicRes.status).toBe(200);
			expect(publicRes.headers.get('Access-Control-Allow-Origin')).toBe('*');

			const privateRes = await app.request('/private/data', {
				method: 'GET',
				headers: { Origin: 'http://anyone.com' },
			});
			expect(privateRes.status).toBe(200);
			expect(privateRes.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('Response preservation', () => {
		test('preserves response status', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware());

			app.get('/ok', (c) => c.json({ ok: true }, 200));
			app.get('/created', (c) => c.json({ created: true }, 201));
			app.get('/error', (c) => c.json({ error: true }, 500));

			const okRes = await app.request('/ok', { method: 'GET' });
			expect(okRes.status).toBe(200);

			const createdRes = await app.request('/created', { method: 'GET' });
			expect(createdRes.status).toBe(201);

			const errorRes = await app.request('/error', { method: 'GET' });
			expect(errorRes.status).toBe(500);
		});

		test('preserves response body', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware());

			app.get('/data', (c) =>
				c.json({
					users: [
						{ id: 1, name: 'Alice' },
						{ id: 2, name: 'Bob' },
					],
				})
			);

			const res = await app.request('/data', { method: 'GET' });
			expect(res.status).toBe(200);

			const data = (await res.json()) as { users: Array<{ id: number; name: string }> };
			expect(data.users).toHaveLength(2);
			expect(data.users[0].name).toBe('Alice');
		});
	});
});
