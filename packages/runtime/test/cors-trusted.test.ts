/**
 * Tests for CORS sameOrigin configuration and createTrustedCorsOrigin helper.
 */

import { expect, describe, beforeEach, afterEach, test as baseTest } from 'bun:test';

const test = baseTest.serial;
import { Hono } from 'hono';
import { createCorsMiddleware } from '../src/middleware';
import { createTrustedCorsOrigin } from '../src/cors';

const APP_CONFIG_KEY = '__AGENTUITY_APP_CONFIG__';

function clearAppConfig() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any)[APP_CONFIG_KEY];
}

function clearEnvVars() {
	delete process.env.AGENTUITY_BASE_URL;
	delete process.env.AGENTUITY_CLOUD_DOMAINS;
	delete process.env.AUTH_TRUSTED_DOMAINS;
}

describe('CORS sameOrigin Configuration', () => {
	beforeEach(() => {
		clearAppConfig();
		clearEnvVars();
	});

	afterEach(() => {
		clearAppConfig();
		clearEnvVars();
	});

	describe('sameOrigin: true option', () => {
		test('blocks requests from untrusted origins', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://evil.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
		});

		test('allows same-origin requests', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('http://localhost/test', {
				method: 'GET',
				headers: { Origin: 'http://localhost' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost');
		});

		test('allows origins from AGENTUITY_BASE_URL', async () => {
			process.env.AGENTUITY_BASE_URL = 'https://myapp.agentuity.run';

			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://myapp.agentuity.run' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://myapp.agentuity.run');
		});

		test('allows origins from AGENTUITY_CLOUD_DOMAINS', async () => {
			process.env.AGENTUITY_CLOUD_DOMAINS = 'https://d1234.agent.run,https://p5678.agent.run';

			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://d1234.agent.run' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://d1234.agent.run');
		});

		test('allows origins from AUTH_TRUSTED_DOMAINS', async () => {
			process.env.AUTH_TRUSTED_DOMAINS = 'https://admin.myapp.com,https://app.myapp.com';

			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://admin.myapp.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.myapp.com');
		});

		test('parses bare domains (adds https://)', async () => {
			process.env.AGENTUITY_CLOUD_DOMAINS = 'myapp.example.com';

			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://myapp.example.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://myapp.example.com');
		});
	});

	describe('allowedOrigins option', () => {
		test('allows explicitly specified origins', async () => {
			const app = new Hono();
			app.use(
				'*',
				createCorsMiddleware({
					sameOrigin: true,
					allowedOrigins: ['https://custom.myapp.com'],
				})
			);
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://custom.myapp.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://custom.myapp.com');
		});

		test('combines env vars with allowedOrigins', async () => {
			process.env.AGENTUITY_BASE_URL = 'https://main.agentuity.run';

			const app = new Hono();
			app.use(
				'*',
				createCorsMiddleware({
					sameOrigin: true,
					allowedOrigins: ['https://extra.myapp.com'],
				})
			);
			app.get('/test', (c) => c.json({ ok: true }));

			// Both should be allowed
			const res1 = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://main.agentuity.run' },
			});
			expect(res1.headers.get('Access-Control-Allow-Origin')).toBe('https://main.agentuity.run');

			const res2 = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://extra.myapp.com' },
			});
			expect(res2.headers.get('Access-Control-Allow-Origin')).toBe('https://extra.myapp.com');
		});

		test('allowedOrigins without sameOrigin still reflects any origin', async () => {
			const app = new Hono();
			app.use(
				'*',
				createCorsMiddleware({
					allowedOrigins: ['https://custom.myapp.com'],
				})
			);
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://any-origin.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://any-origin.com');
		});
	});

	describe('backwards compatibility', () => {
		test('no options reflects any origin', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware());
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://any-origin.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://any-origin.com');
		});

		test('sameOrigin: false reflects any origin', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: false }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://any-origin.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://any-origin.com');
		});

		test('explicit origin option takes precedence over sameOrigin', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware({ origin: '*' }));
			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', {
				method: 'GET',
				headers: { Origin: 'https://any-origin.com' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('preflight OPTIONS requests', () => {
		test('handles preflight with sameOrigin: true', async () => {
			process.env.AGENTUITY_BASE_URL = 'https://myapp.agentuity.run';

			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.post('/api', (c) => c.json({ ok: true }));

			const res = await app.request('/api', {
				method: 'OPTIONS',
				headers: {
					Origin: 'https://myapp.agentuity.run',
					'Access-Control-Request-Method': 'POST',
				},
			});

			expect(res.status).toBe(204);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://myapp.agentuity.run');
		});

		test('blocks preflight from untrusted origins', async () => {
			const app = new Hono();
			app.use('*', createCorsMiddleware({ sameOrigin: true }));
			app.post('/api', (c) => c.json({ ok: true }));

			const res = await app.request('/api', {
				method: 'OPTIONS',
				headers: {
					Origin: 'https://evil.com',
					'Access-Control-Request-Method': 'POST',
				},
			});

			expect(res.status).toBe(204);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
		});
	});
});

describe('Required headers always included', () => {
	test('custom allowHeaders still includes x-thread-id', async () => {
		const app = new Hono();
		app.use('*', createCorsMiddleware({ allowHeaders: ['X-Custom-Header'] }));
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
		expect(allowHeaders).toContain('x-thread-id');
	});

	test('custom exposeHeaders still includes required runtime headers', async () => {
		const app = new Hono();
		app.use('*', createCorsMiddleware({ exposeHeaders: ['X-Custom-Response'] }));
		app.get('/api', (c) => c.json({ ok: true }));

		const res = await app.request('/api', {
			method: 'GET',
			headers: { Origin: 'http://example.com' },
		});

		expect(res.status).toBe(200);
		const exposeHeaders = res.headers.get('Access-Control-Expose-Headers');
		expect(exposeHeaders).toContain('X-Custom-Response');
		expect(exposeHeaders).toContain('x-thread-id');
		expect(exposeHeaders).toContain('x-session-id');
	});
});

describe('createTrustedCorsOrigin helper', () => {
	beforeEach(() => {
		clearEnvVars();
	});

	afterEach(() => {
		clearEnvVars();
	});

	test('can be used directly with Hono cors middleware', async () => {
		process.env.AGENTUITY_BASE_URL = 'https://myapp.agentuity.run';

		const { cors } = await import('hono/cors');
		const app = new Hono();

		app.use(
			'*',
			cors({
				origin: createTrustedCorsOrigin({
					allowedOrigins: ['https://extra.example.com'],
				}),
			})
		);
		app.get('/test', (c) => c.json({ ok: true }));

		// Allowed from env
		const res1 = await app.request('/test', {
			method: 'GET',
			headers: { Origin: 'https://myapp.agentuity.run' },
		});
		expect(res1.headers.get('Access-Control-Allow-Origin')).toBe('https://myapp.agentuity.run');

		// Allowed from allowedOrigins
		const res2 = await app.request('/test', {
			method: 'GET',
			headers: { Origin: 'https://extra.example.com' },
		});
		expect(res2.headers.get('Access-Control-Allow-Origin')).toBe('https://extra.example.com');

		// Blocked
		const res3 = await app.request('/test', {
			method: 'GET',
			headers: { Origin: 'https://evil.com' },
		});
		expect(res3.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});
});
