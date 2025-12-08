import { describe, test, expect } from 'bun:test';
import { generateRouteRegistry, type RouteInfo } from '../src/cmd/build/route-registry';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Test route registry generation to ensure all routes are included,
 * not just those with validators.
 */
describe('Route Registry Generation', () => {
	function createTestDir(): { tempDir: string; cleanup: () => void } {
		const tempDir = mkdtempSync(join(tmpdir(), 'route-registry-test-'));
		return {
			tempDir,
			cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
		};
	}

	test('should include routes without validators in registry', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/health',
					filename: 'src/api/health.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'POST',
					path: '/api/hello',
					filename: 'src/api/index.ts',
					hasValidator: true,
					routeType: 'api',
					agentVariable: 'hello',
					agentImportPath: '@agent/hello',
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// Both routes should be in the registry
			expect(content).toContain("'GET /api/health'");
			expect(content).toContain("'POST /api/hello'");
		} finally {
			cleanup();
		}
	});

	test('should handle routes with only validators', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/hello',
					filename: 'src/api/index.ts',
					hasValidator: true,
					routeType: 'api',
					agentVariable: 'hello',
					agentImportPath: '@agent/hello',
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			expect(content).toContain("'POST /api/hello'");
			expect(content).toContain('agent_hello');
		} finally {
			cleanup();
		}
	});

	test('should skip generation if no routes exist', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const exists = Bun.file(registryPath).exists();

			// Should not generate file if no routes
			expect(exists).resolves.toBe(false);
		} finally {
			cleanup();
		}
	});

	test('should include CRUD routes without validators', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/items',
					filename: 'src/api/items.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'POST',
					path: '/api/items',
					filename: 'src/api/items.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'PUT',
					path: '/api/items/:id',
					filename: 'src/api/items.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'DELETE',
					path: '/api/items/:id',
					filename: 'src/api/items.ts',
					hasValidator: false,
					routeType: 'api',
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// All CRUD routes should be in the registry
			expect(content).toContain("'GET /api/items'");
			expect(content).toContain("'POST /api/items'");
			expect(content).toContain("'PUT /api/items/:id'");
			expect(content).toContain("'DELETE /api/items/:id'");
		} finally {
			cleanup();
		}
	});

	test('should use never for input/output schemas on routes without validators', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/health',
					filename: 'src/api/health.ts',
					hasValidator: false,
					routeType: 'api',
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// Routes without validators should use never for schemas
			expect(content).toContain("'GET /api/health'");
			expect(content).toContain('inputSchema: never');
			expect(content).toContain('outputSchema: never');
		} finally {
			cleanup();
		}
	});

	test('should handle mixed routes with and without validators', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/health',
					filename: 'src/api/health.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'POST',
					path: '/api/hello',
					filename: 'src/api/index.ts',
					hasValidator: true,
					routeType: 'api',
					agentVariable: 'hello',
					agentImportPath: '@agent/hello',
				},
				{
					method: 'GET',
					path: '/api/items',
					filename: 'src/api/items.ts',
					hasValidator: false,
					routeType: 'api',
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// All routes should be present
			expect(content).toContain("'GET /api/health'");
			expect(content).toContain("'POST /api/hello'");
			expect(content).toContain("'GET /api/items'");

			// Validator route should have agent type
			expect(content).toContain('agent_hello');

			// Non-validator routes should have never type
			const healthMatch = content.match(/'GET \/api\/health'[\s\S]*?}/);
			expect(healthMatch?.[0]).toContain('never');
		} finally {
			cleanup();
		}
	});
});
