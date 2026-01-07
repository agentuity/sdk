/**
 * Tests for compression middleware.
 * Tests the createCompressionMiddleware function and its configuration options.
 *
 * Note: Hono's compress middleware uses CompressionStream which may not be
 * available in all test environments. These tests focus on the middleware
 * logic (config resolution, bypasses) rather than actual compression.
 */

import {
	expect,
	describe,
	beforeAll,
	beforeEach,
	afterEach,
	afterAll,
	test as baseTest,
} from 'bun:test';

// Use serial tests to avoid race conditions with global app config state
const test = baseTest.serial;
import { Hono } from 'hono';
import { createCompressionMiddleware } from '../src/middleware';

// Generate a large string that will exceed the default threshold
function generateLargePayload(size = 2048): string {
	return 'x'.repeat(size);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setAppConfig(config: any) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_APP_CONFIG__ = config;
}

function clearAppConfig() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any).__AGENTUITY_APP_CONFIG__;
}

// Tests use global app config state, so beforeAll/afterAll ensure file-level isolation
// and beforeEach/afterEach ensure test-level isolation
describe('Compression Middleware', () => {
	// Clear at file level to ensure isolation from other test files
	beforeAll(() => {
		clearAppConfig();
	});

	afterAll(() => {
		clearAppConfig();
	});

	beforeEach(() => {
		clearAppConfig();
	});

	afterEach(() => {
		clearAppConfig();
	});

	describe('Basic behavior', () => {
		test('middleware processes request and returns response', async () => {
			const app = new Hono();
			// Disable compression to test basic passthrough
			app.use('*', createCompressionMiddleware({ enabled: false }));
			app.get('/test', (c) => {
				return c.json({ message: 'hello' });
			});

			const res = await app.request('/test', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect((data as { message: string }).message).toBe('hello');
		});

		test('passes through without Accept-Encoding header', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware());
			app.get('/test', (c) => {
				return c.json({ data: generateLargePayload(2048) });
			});

			const res = await app.request('/test', {
				method: 'GET',
				// No Accept-Encoding header
			});

			expect(res.status).toBe(200);
			// Without Accept-Encoding, no compression should happen
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});
	});

	describe('Configuration options', () => {
		test('enabled: false disables compression', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware({ enabled: false }));
			app.get('/test', (c) => {
				return c.json({ data: generateLargePayload(2048) });
			});

			const res = await app.request('/test', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});

		test('compression: false in app config disables compression', async () => {
			setAppConfig({ compression: false });

			const app = new Hono();
			app.use('*', createCompressionMiddleware());
			app.get('/test', (c) => {
				return c.json({ data: generateLargePayload(2048) });
			});

			const res = await app.request('/test', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});

		test('static config enabled:false overrides app config', async () => {
			setAppConfig({ compression: { threshold: 100 } });

			const app = new Hono();
			app.use('*', createCompressionMiddleware({ enabled: false }));
			app.get('/test', (c) => {
				return c.json({ data: generateLargePayload(2048) });
			});

			const res = await app.request('/test', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});

		test('custom filter function disables compression for filtered paths', async () => {
			// Test that filter function can block compression
			// We verify by checking that the path we want to filter doesn't get compressed
			const app = new Hono();
			app.use(
				'*',
				createCompressionMiddleware({
					filter: (c) => {
						// Only allow compression for paths starting with /compress
						return c.req.path.startsWith('/compress');
					},
				})
			);
			app.get('/no-compress', (c) => {
				return c.json({ data: generateLargePayload(2048) });
			});

			const res = await app.request('/no-compress', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			// Filter returned false for /no-compress, so no compression
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});

		test('filter function can allow specific paths', async () => {
			const app = new Hono();
			app.use(
				'*',
				createCompressionMiddleware({
					filter: (c) => !c.req.path.startsWith('/no-compress'),
				})
			);
			app.get('/no-compress/data', (c) => {
				return c.json({ data: generateLargePayload(2048) });
			});

			const res = await app.request('/no-compress/data', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			// Filter returned false for /no-compress paths
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});
	});

	describe('WebSocket bypass', () => {
		test('bypasses WebSocket upgrade requests', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware());
			app.get('/ws', (c) => {
				return c.json({ upgrade: 'websocket' });
			});

			const res = await app.request('/ws', {
				method: 'GET',
				headers: {
					'Accept-Encoding': 'gzip',
					Upgrade: 'websocket',
					Connection: 'Upgrade',
				},
			});

			expect(res.status).toBe(200);
			// WebSocket requests should bypass compression entirely
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});
	});

	describe('Lazy config resolution', () => {
		test('reads config from app state at request time', async () => {
			const app = new Hono();
			// Register middleware BEFORE setting config (simulating real startup order)
			app.use('*', createCompressionMiddleware());
			app.get('/test', (c) => {
				return c.json({ data: generateLargePayload(2048) });
			});

			// Now set config (simulating createApp running after middleware registration)
			setAppConfig({ compression: false });

			const res = await app.request('/test', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			// Config was resolved lazily, compression should be disabled
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});

		test('works without any config (uses defaults)', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware());
			app.get('/test', (c) => {
				return c.json({ message: 'hello' });
			});

			const res = await app.request('/test', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			// Middleware works without crashing
			expect(res.status).toBe(200);
			// Response has a body (may or may not be compressed depending on environment)
			const buffer = await res.arrayBuffer();
			expect(buffer.byteLength).toBeGreaterThan(0);
		});
	});

	describe('Multiple routes', () => {
		test('handles multiple routes without interference', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware({ enabled: false }));

			app.get('/a', (c) => c.json({ route: 'a' }));
			app.get('/b', (c) => c.json({ route: 'b' }));
			app.post('/c', (c) => c.json({ route: 'c' }));

			const resA = await app.request('/a', { method: 'GET' });
			expect(resA.status).toBe(200);
			expect(((await resA.json()) as { route: string }).route).toBe('a');

			const resB = await app.request('/b', { method: 'GET' });
			expect(resB.status).toBe(200);
			expect(((await resB.json()) as { route: string }).route).toBe('b');

			const resC = await app.request('/c', { method: 'POST' });
			expect(resC.status).toBe(200);
			expect(((await resC.json()) as { route: string }).route).toBe('c');
		});
	});

	describe('SSE and streaming bypass', () => {
		test('SSE responses (text/event-stream) are not compressed', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware());
			app.get('/sse', (_c) => {
				return new Response(generateLargePayload(2048), {
					headers: { 'Content-Type': 'text/event-stream' },
				});
			});

			const res = await app.request('/sse', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Type')).toBe('text/event-stream');
			// SSE should NOT be compressed
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});

		test('binary stream responses (application/octet-stream) are not compressed', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware());
			app.get('/stream', (_c) => {
				return new Response(generateLargePayload(2048), {
					headers: { 'Content-Type': 'application/octet-stream' },
				});
			});

			const res = await app.request('/stream', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
			// Binary streams should NOT be compressed
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});

		test('text/event-stream with charset is not compressed', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware());
			app.get('/sse', (_c) => {
				return new Response(generateLargePayload(2048), {
					headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
				});
			});

			const res = await app.request('/sse', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			// SSE should NOT be compressed even with charset
			expect(res.headers.get('Content-Encoding')).toBeNull();
		});
	});

	describe('Response preservation', () => {
		test('preserves response status codes', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware());

			app.get('/created', (c) => c.json({ ok: true }, 201));
			app.get('/not-found', (c) => c.json({ error: 'not found' }, 404));

			const created = await app.request('/created', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});
			expect(created.status).toBe(201);

			const notFound = await app.request('/not-found', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});
			expect(notFound.status).toBe(404);
		});

		test('preserves custom headers', async () => {
			const app = new Hono();
			app.use('*', createCompressionMiddleware({ enabled: false }));
			app.get('/test', (c) => {
				c.header('X-Custom', 'value');
				return c.json({ ok: true });
			});

			const res = await app.request('/test', {
				method: 'GET',
				headers: { 'Accept-Encoding': 'gzip' },
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('X-Custom')).toBe('value');
		});
	});
});
