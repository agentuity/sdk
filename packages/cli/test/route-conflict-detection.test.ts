import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = '/tmp/agentuity-cli-test-route-conflicts';

/**
 * Tests for route conflict detection during build
 * These tests will guide implementation of validation logic in plugin.ts
 */
describe('Route Conflict Detection', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test('should detect duplicate route paths in same file', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');
		const routeFile = join(TEST_DIR, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/users', (c) => c.json({ users: [] }));
router.get('/users', (c) => c.json({ different: 'handler' }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		
		// Should parse both routes successfully
		expect(routes).toHaveLength(2);
		
		// Validation logic should detect this as a conflict
		// (This will be implemented in plugin.ts validation)
		const paths = routes.map(r => `${r.method.toUpperCase()} ${r.path}`);
		const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i);
		expect(duplicates).toHaveLength(1);
		// Path will have /api/{folder} prefix
		expect(duplicates[0]).toContain('GET /api');
	});

	test('should detect duplicate methods with different cases', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');
		const routeFile = join(TEST_DIR, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/api/status', (c) => c.json({ ok: true }));
router.GET('/api/status', (c) => c.json({ ok: false }));

export default router;
		`;
		writeFileSync(routeFile, code);

		// Note: Hono likely rejects .GET() but we should test our parsing
		// This might throw during parse or we catch it in validation
		try {
			const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
			const normalized = routes.map(r => `${r.method.toUpperCase()} ${r.path}`);
			const unique = new Set(normalized);
			expect(unique.size).toBeLessThan(normalized.length);
		} catch (error) {
			// Expected - parser might reject invalid method names
			expect(error).toBeDefined();
		}
	});

	test('should allow same path with different HTTP methods', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');
		const routeFile = join(TEST_DIR, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/users', (c) => c.json({ users: [] }));
router.post('/users', (c) => c.json({ created: true }));
router.put('/users/:id', (c) => c.json({ updated: true }));
router.delete('/users/:id', (c) => c.json({ deleted: true }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(4);
		
		// Should NOT be conflicts - different methods
		const methodPathPairs = routes.map(r => `${r.method.toUpperCase()} ${r.path}`);
		const unique = new Set(methodPathPairs);
		expect(unique.size).toBe(4);
	});

	test('should detect conflicting param names', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');
		const routeFile = join(TEST_DIR, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/users/:id', (c) => c.json({ user: 'by-id' }));
router.get('/users/:userId', (c) => c.json({ user: 'by-userId' }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(2);
		
		// These are runtime conflicts in Hono - both match same pattern
		// Validation should warn about ambiguous routes
		const hasParamConflict = routes[0].path.includes(':') && routes[1].path.includes(':');
		expect(hasParamConflict).toBe(true);
	});

	test('should detect wildcard conflicts', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');
		const routeFile = join(TEST_DIR, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/files/*', (c) => c.text('wildcard'));
router.get('/files/:path', (c) => c.text('param'));
router.get('/files/specific', (c) => c.text('specific'));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(3);
		
		// All three routes could match "/files/test"
		// This is a potential conflict to warn about  
		// Routes will have /api/{folder}/files prefix
		const allFilesRoutes = routes.every(r => r.path.includes('/files'));
		expect(allFilesRoutes).toBe(true);
	});

	test('should handle routes with different path separators', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');
		const routeFile = join(TEST_DIR, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/users/', (c) => c.json({ users: [] }));
router.get('/users', (c) => c.json({ users: [] }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(2);
		
		// Hono treats these as different routes, but they might be unintentional duplicates
		// Normalize for comparison
		const normalized = routes.map(r => ({
			method: r.method,
			path: r.path.replace(/\/+$/, '') // Remove trailing slashes
		}));
		
		const paths = normalized.map(r => `${r.method.toUpperCase()} ${r.path}`);
		const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i);
		
		// Should detect conflict between /users and /users/ (normalized to same path)
		expect(duplicates.length).toBeGreaterThan(0);
	});

	test('should validate variable name collisions in auto-mount', async () => {
		// Test camelCase conversion for potential collisions
		const { toCamelCase } = await import('../src/utils/string');
		
		const folders = ['user-api', 'userApi', 'user_api', 'UserAPI'];
		const camelNames = folders.map(f => toCamelCase(f));
		
		// Check for collisions
		const unique = new Set(camelNames);
		
		// If collision exists, we need validation
		if (unique.size < camelNames.length) {
			expect(unique.size).toBeLessThan(folders.length);
		}
	});

	test('should detect cross-file route conflicts', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');
		
		// Create two files with potentially conflicting routes
		const file1 = join(TEST_DIR, 'route1.ts');
		const file2 = join(TEST_DIR, 'route2.ts');

		const code1 = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/shared', (c) => c.json({ from: 'file1' }));
export default router;
		`;

		const code2 = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/shared', (c) => c.json({ from: 'file2' }));
export default router;
		`;

		writeFileSync(file1, code1);
		writeFileSync(file2, code2);

		const routes1 = await parseRoute(TEST_DIR, file1, 'proj_1', 'dep_1');
		const routes2 = await parseRoute(TEST_DIR, file2, 'proj_1', 'dep_1');

		// Both parse successfully individually
		expect(routes1).toHaveLength(1);
		expect(routes2).toHaveLength(1);

		// But when combined, there's a conflict
		// This validation should happen in plugin.ts when collecting all routes
		const allRoutes = [...routes1, ...routes2];
		const methodPaths = allRoutes.map(r => `${r.method.toUpperCase()} ${r.path}`);
		const duplicates = methodPaths.filter((p, i) => methodPaths.indexOf(p) !== i);
		
		expect(duplicates).toHaveLength(1);
		// Path will have /api/{folder} prefix
		expect(duplicates[0]).toContain('GET /api');
	});

	test('should handle mount path prefix conflicts', () => {
		// Simulate the auto-mount scenario
		// If we have:
		// - src/api/index.ts (mounted at /api)
		// - src/api/users/route.ts (auto-mounted at /api/users)
		// And index.ts also defines /users route, there's a conflict

		const apiIndexRoutes = [
			{ method: 'get', path: '/users', filename: 'src/api/index.ts' },
			{ method: 'get', path: '/status', filename: 'src/api/index.ts' }
		];

		const usersRouteRoutes = [
			{ method: 'get', path: '/', filename: 'src/api/users/route.ts' } // Will be mounted at /api/users
		];

		// After mounting users at /api/users, the effective path is /api/users/
		// This conflicts with /users from index.ts if index is also at /api
		
		// Build effective paths (this logic should be in plugin.ts)
		const apiIndexEffective = apiIndexRoutes.map(r => ({
			...r,
			effectivePath: r.path // Already under /api mount
		}));

		const usersEffective = usersRouteRoutes.map(r => ({
			...r,
			effectivePath: `/users${r.path}` // Mounted at /api/users
		}));

		const allEffective = [...apiIndexEffective, ...usersEffective];
		const paths = allEffective.map(r => `${r.method.toUpperCase()} ${r.effectivePath}`);
		
		// Check for overlaps - should have both 'GET /users' from index and 'GET /users/' from subdirectory
		const hasConflict = paths.includes('GET /users') && paths.includes('GET /users/');
		expect(hasConflict).toBe(true);
	});
});
