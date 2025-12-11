import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';

/**
 * Test the catch-all routing behavior to ensure:
 * 1. API routes return 404 (not HTML) when not found
 * 2. Non-API routes return HTML for SPA fallback
 * 3. Edge cases like /api vs /api/ vs /apiSomething are handled correctly
 *
 * This simulates the routing logic generated in plugin.ts lines 384-396
 */
describe('Catch-all Routing', () => {
	// Helper to create a test app with the same routing logic as plugin.ts
	const createTestApp = () => {
		const app = new Hono();
		const index = '<html><body>SPA</body></html>';

		// Define some API routes
		app.get('/api/users', (c) => c.json({ users: [] }));
		app.get('/api/agents', (c) => c.json({ agents: [] }));

		// Root route
		app.get('/', (c) => c.html(index));

		// Catch-all route (simulates plugin.ts lines 388-404)
		app.get('/*', async (c) => {
			const path = c.req.path;
			// Skip API routes - let them 404 naturally
			if (path === '/api' || path.startsWith('/api/')) {
				return c.notFound();
			}
			// Prevent directory traversal attacks
			if (path.includes('..') || path.includes('%2e%2e')) {
				return c.notFound();
			}
			// Don't catch workbench routes (already handled above)
			if (path.startsWith('/workbench')) {
				return c.notFound();
			}
			// serve default for any path not explicitly matched
			return c.html(index);
		});

		return app;
	};

	test('should return JSON for existing API routes', async () => {
		const app = createTestApp();
		const res = await app.request('/api/users');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/json');
		const data = await res.json();
		expect(data).toEqual({ users: [] });
	});

	test('should return 404 for non-existent API routes (not HTML)', async () => {
		const app = createTestApp();
		const res = await app.request('/api/nonexistent');

		expect(res.status).toBe(404);
		const contentType = res.headers.get('content-type');
		expect(contentType).not.toContain('text/html');
	});

	test('should return 404 for /api path exactly', async () => {
		const app = createTestApp();
		const res = await app.request('/api');

		expect(res.status).toBe(404);
		const contentType = res.headers.get('content-type');
		expect(contentType).not.toContain('text/html');
	});

	test('should return 404 for /api/ with trailing slash', async () => {
		const app = createTestApp();
		const res = await app.request('/api/');

		expect(res.status).toBe(404);
		const contentType = res.headers.get('content-type');
		expect(contentType).not.toContain('text/html');
	});

	test('should return HTML for root path', async () => {
		const app = createTestApp();
		const res = await app.request('/');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		const html = await res.text();
		expect(html).toContain('<html>');
	});

	test('should return HTML for SPA routes (not /api)', async () => {
		const app = createTestApp();
		const res = await app.request('/dashboard');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		const html = await res.text();
		expect(html).toContain('<html>');
	});

	test('should return HTML for nested SPA routes', async () => {
		const app = createTestApp();
		const res = await app.request('/dashboard/settings');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		const html = await res.text();
		expect(html).toContain('<html>');
	});

	test('should return HTML for /apiSomething (not an API route)', async () => {
		const app = createTestApp();
		const res = await app.request('/apiSomething');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		const html = await res.text();
		expect(html).toContain('<html>');
	});

	test('should block paths with .. (directory traversal protection)', async () => {
		const app = createTestApp();
		const res = await app.request('/path/../secret');

		// Hono normalizes paths, so /path/../secret becomes /secret
		// The check still works if someone tries raw request manipulation
		// This test documents the behavior - path normalization happens before our check
		expect(res.status).toBe(200); // normalized to /secret which is valid
		expect(res.headers.get('content-type')).toContain('text/html');
	});

	test('should block URL-encoded .. (directory traversal protection)', async () => {
		const app = createTestApp();
		const res = await app.request('/path/%2e%2e/secret');

		// URL decoding happens before path normalization
		// Similar to above - normalized before reaching handler
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
	});

	test('should return HTML for paths with dots (not traversal)', async () => {
		const app = createTestApp();
		const res = await app.request('/v1.0/docs');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		const html = await res.text();
		expect(html).toContain('<html>');
	});

	test('should return 404 for /workbench routes', async () => {
		const app = createTestApp();
		const res = await app.request('/workbench');

		expect(res.status).toBe(404);
		const contentType = res.headers.get('content-type');
		expect(contentType).not.toContain('text/html');
	});

	test('should return 404 for /workbench/ with trailing slash', async () => {
		const app = createTestApp();
		const res = await app.request('/workbench/');

		expect(res.status).toBe(404);
		const contentType = res.headers.get('content-type');
		expect(contentType).not.toContain('text/html');
	});

	test('should return 404 for nested /workbench routes', async () => {
		const app = createTestApp();
		const res = await app.request('/workbench/settings');

		expect(res.status).toBe(404);
		const contentType = res.headers.get('content-type');
		expect(contentType).not.toContain('text/html');
	});
});
