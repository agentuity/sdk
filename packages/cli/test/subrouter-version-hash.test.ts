import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { parseRoute } from '../src/cmd/build/ast';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Helper: SHA-256 hash (matches the `hash()` function in ast.ts used for version computation)
 */
function hash(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha256');
	val.map((v) => hasher.update(v));
	return hasher.digest().toHex();
}

/**
 * Helper: SHA-1 hash (matches the `hashSHA1()` function in ast.ts used for route ID generation)
 */
function hashSHA1(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha1');
	val.map((v) => hasher.update(v));
	return hasher.digest().toHex();
}

/**
 * Replicates generateRouteId from ast.ts
 */
function generateRouteId(
	projectId: string,
	deploymentId: string,
	type: string,
	method: string,
	filename: string,
	path: string,
	version: string
): string {
	return `route_${hashSHA1(projectId, deploymentId, type, method, filename, path, version)}`;
}

describe('Sub-router version hash consistency', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `agentuity-subrouter-version-test-${Date.now()}`);
		rmSync(testDir, { recursive: true, force: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('mounted sub-router routes should use sub-router file version for route ID, not parent version', async () => {
		// Create directory structure:
		//   src/api/index.ts       (parent - mounts sub-router)
		//   src/api/items/index.ts  (sub-router - defines routes)
		const apiDir = join(testDir, 'src', 'api');
		const itemsDir = join(apiDir, 'items');
		mkdirSync(itemsDir, { recursive: true });

		const subRouterCode = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/list', (c) => c.json({ items: [] }));
router.post('/create', (c) => c.json({ created: true }));

export default router;
`;

		const parentCode = `
import { createRouter } from '@agentuity/runtime';
import itemsRouter from './items';

const api = createRouter();
api.route('/items', itemsRouter);

export default api;
`;

		writeFileSync(join(itemsDir, 'index.ts'), subRouterCode);
		writeFileSync(join(apiDir, 'index.ts'), parentCode);

		const projectId = 'proj_test123';
		const deploymentId = 'deploy_test456';

		const routes = await parseRoute(testDir, join(apiDir, 'index.ts'), projectId, deploymentId);

		// Should discover the sub-router's routes mounted under /items
		const itemRoutes = routes.filter((r) => r.path.includes('/items'));
		expect(itemRoutes.length).toBeGreaterThanOrEqual(2);

		// Compute versions for both files
		const parentVersion = hash(parentCode);
		const subRouterVersion = hash(subRouterCode);

		// The parent and sub-router should have different content hashes
		expect(parentVersion).not.toBe(subRouterVersion);

		// For each mounted sub-router route, verify the route ID uses the SUB-ROUTER's version
		for (const route of itemRoutes) {
			// The route's version field should be the sub-router's file hash
			expect(route.version).toBe(subRouterVersion);

			// The route ID should be computed using the sub-router's version
			const expectedId = generateRouteId(
				projectId,
				deploymentId,
				route.type,
				route.method,
				route.filename,
				route.path,
				route.version // sub-router's version
			);
			expect(route.id).toBe(expectedId);

			// Verify it does NOT match a route ID computed with the parent's version
			const wrongId = generateRouteId(
				projectId,
				deploymentId,
				route.type,
				route.method,
				route.filename,
				route.path,
				parentVersion // parent's version - this was the bug
			);
			expect(route.id).not.toBe(wrongId);
		}
	});

	test('route ID and version field should always be consistent for mounted sub-routes', async () => {
		// Regression test: the route.id must be derivable from the other route fields
		// (projectId, deploymentId, type, method, filename, path, version).
		// This is what the server validates during deploy.
		const apiDir = join(testDir, 'src', 'api');
		const monitorDir = join(apiDir, 'monitor');
		mkdirSync(monitorDir, { recursive: true });

		const subRouterCode = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/sitemaps', (c) => c.json([]));
router.post('/sitemaps', (c) => c.json({ created: true }));
router.delete('/sitemaps/:id', (c) => c.json({ deleted: true }));

export default router;
`;

		const parentCode = `
import { createRouter } from '@agentuity/runtime';
import monitorRoutes from './monitor';

const api = createRouter();
api.route('/monitor', monitorRoutes);

export default api;
`;

		writeFileSync(join(monitorDir, 'index.ts'), subRouterCode);
		writeFileSync(join(apiDir, 'index.ts'), parentCode);

		const projectId = 'proj_bd7385ecab4d5773c5cadb66d2d83d16';
		const deploymentId = 'deploy_e4e4ee06731cab17740e38dae6b08d6f';

		const routes = await parseRoute(testDir, join(apiDir, 'index.ts'), projectId, deploymentId);

		// Validate ALL routes have consistent id vs version (the server-side check)
		for (const route of routes) {
			const expectedId = generateRouteId(
				projectId,
				deploymentId,
				route.type,
				route.method,
				route.filename,
				route.path,
				route.version
			);
			expect(route.id).toBe(expectedId);
		}
	});

	test('changing parent file should not change sub-router route versions', async () => {
		// When the parent mount file changes but the sub-router doesn't,
		// the sub-router route versions should remain the same.
		const apiDir = join(testDir, 'src', 'api');
		const itemsDir = join(apiDir, 'items');
		mkdirSync(itemsDir, { recursive: true });

		const subRouterCode = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/list', (c) => c.json({ items: [] }));
export default router;
`;

		const parentCodeV1 = `
import { createRouter } from '@agentuity/runtime';
import itemsRouter from './items';
const api = createRouter();
api.route('/items', itemsRouter);
export default api;
`;

		const parentCodeV2 = `
import { createRouter } from '@agentuity/runtime';
import itemsRouter from './items';
// Added a comment - parent changed but sub-router didn't
const api = createRouter();
api.route('/items', itemsRouter);
export default api;
`;

		writeFileSync(join(itemsDir, 'index.ts'), subRouterCode);

		const projectId = 'proj_test';
		const deploymentId = 'deploy_test';

		// Parse with parent V1
		writeFileSync(join(apiDir, 'index.ts'), parentCodeV1);
		const routesV1 = await parseRoute(testDir, join(apiDir, 'index.ts'), projectId, deploymentId);
		const itemRouteV1 = routesV1.find((r) => r.path.includes('/items/list'));

		// Parse with parent V2 (only parent changed)
		writeFileSync(join(apiDir, 'index.ts'), parentCodeV2);
		const routesV2 = await parseRoute(testDir, join(apiDir, 'index.ts'), projectId, deploymentId);
		const itemRouteV2 = routesV2.find((r) => r.path.includes('/items/list'));

		expect(itemRouteV1).toBeDefined();
		expect(itemRouteV2).toBeDefined();

		// Sub-router route version should be the same since sub-router file didn't change
		expect(itemRouteV1!.version).toBe(itemRouteV2!.version);

		// Route IDs should also be the same (version is consistent)
		expect(itemRouteV1!.id).toBe(itemRouteV2!.id);
	});
});
