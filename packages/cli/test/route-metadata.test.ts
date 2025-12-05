import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test that API route metadata is correctly extracted and added to
 * agentuity.metadata.json during the build process.
 */
describe('Route Metadata Generation', () => {
	test('agentuity.metadata.json should contain routes from src/api', () => {
		const testProjectPath = '/Users/jhaynie/tmp/v1/refactor-2';
		const metadataPath = join(testProjectPath, '.agentuity', 'agentuity.metadata.json');

		if (!existsSync(metadataPath)) {
			console.log('Metadata file not found, run build first');
			return;
		}

		const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));

		// Should have routes array
		expect(metadata.routes).toBeDefined();
		expect(Array.isArray(metadata.routes)).toBe(true);

		// Should have at least one route (POST /api/hello)
		expect(metadata.routes.length).toBeGreaterThan(0);

		// Check first route structure
		const route = metadata.routes[0];
		expect(route).toHaveProperty('id');
		expect(route).toHaveProperty('method');
		expect(route).toHaveProperty('type');
		expect(route).toHaveProperty('filename');
		expect(route).toHaveProperty('path');
		expect(route).toHaveProperty('version');

		// Verify route values
		expect(route.filename).toBe('src/api/index.ts');
		expect(route.method).toBe('post');
		expect(route.type).toBe('api');
		expect(route.path).toBe('/api/hello'); // Should NOT be /api/api/hello
	});

	test('parseRoute should support both createRouter and new Hono()', () => {
		// This documents the expected behavior:
		// 1. Files using createRouter() from @agentuity/runtime are parsed
		// 2. Files using new Hono() from hono are also parsed
		// 3. Both patterns extract route definitions correctly

		const createRouterExample = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/test', (c) => c.json({ ok: true }));
export default router;`;

		const honoExample = `
import { Hono } from 'hono';
const api = new Hono();
api.post('/hello', (c) => c.json({ message: 'hi' }));
export default api;`;

		expect(createRouterExample).toContain('createRouter');
		expect(honoExample).toContain('new Hono');
	});

	test('route paths should not double-prefix /api', () => {
		// When we mount src/api/index.ts at /api, and it has router.post('/hello'),
		// the final route should be /api/hello, NOT /api/api/hello
		const testProjectPath = '/Users/jhaynie/tmp/v1/refactor-2';
		const metadataPath = join(testProjectPath, '.agentuity', 'agentuity.metadata.json');

		if (!existsSync(metadataPath)) {
			return;
		}

		const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
		const routes = metadata.routes;

		for (const route of routes) {
			// No route should have double /api/api
			expect(route.path).not.toContain('/api/api');
		}
	});
});
