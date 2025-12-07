import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverRouteFiles, detectRouteConflicts } from '../src/cmd/build/route-discovery';

const TEST_DIR = '/tmp/agentuity-cli-test-route-discovery';

describe('Route Discovery', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test('should discover route.ts files in subdirectories', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(join(apiDir, 'auth'), { recursive: true });
		mkdirSync(join(apiDir, 'users'), { recursive: true });

		writeFileSync(join(apiDir, 'index.ts'), '// root api');
		writeFileSync(join(apiDir, 'auth', 'route.ts'), '// auth routes');
		writeFileSync(join(apiDir, 'users', 'route.ts'), '// user routes');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(2); // index.ts is skipped
		expect(routes.find((r) => r.mountPath === '/api/auth')).toBeDefined();
		expect(routes.find((r) => r.mountPath === '/api/users')).toBeDefined();
	});

	test('should discover nested route files', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(join(apiDir, 'v1', 'admin', 'users'), { recursive: true });
		mkdirSync(join(apiDir, 'v2', 'public'), { recursive: true });

		writeFileSync(join(apiDir, 'v1', 'admin', 'users', 'route.ts'), '// admin users');
		writeFileSync(join(apiDir, 'v2', 'public', 'route.ts'), '// public v2');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(2);

		const adminUsers = routes.find((r) => r.mountPath === '/api/v1/admin/users');
		expect(adminUsers).toBeDefined();
		expect(adminUsers!.variableName).toBe('v1AdminUsersRoute');
		expect(adminUsers!.importPath).toBe('./src/api/v1/admin/users/route');

		const publicV2 = routes.find((r) => r.mountPath === '/api/v2/public');
		expect(publicV2).toBeDefined();
		expect(publicV2!.variableName).toBe('v2PublicRoute');
	});

	test('should discover any .ts file in subdirectories', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(join(apiDir, 'auth'), { recursive: true });

		writeFileSync(join(apiDir, 'auth', 'login.ts'), '// login route');
		writeFileSync(join(apiDir, 'auth', 'logout.ts'), '// logout route');
		writeFileSync(join(apiDir, 'auth', 'verify.ts'), '// verify route');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(3);
		expect(routes.every((r) => r.mountPath === '/api/auth')).toBe(true);

		const variableNames = routes.map((r) => r.variableName).sort();
		expect(variableNames).toEqual(['authLoginRoute', 'authLogoutRoute', 'authVerifyRoute']);
	});

	test('should skip .generated.ts files', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(join(apiDir, 'auth'), { recursive: true });

		writeFileSync(join(apiDir, 'auth', 'route.ts'), '// auth routes');
		writeFileSync(join(apiDir, 'auth', 'types.generated.ts'), '// generated types');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(1);
		expect(routes[0].filepath).toContain('route.ts');
	});

	test('should handle deeply nested structures', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		const deepPath = join(apiDir, 'v1', 'admin', 'system', 'health', 'checks');
		mkdirSync(deepPath, { recursive: true });

		writeFileSync(join(deepPath, 'route.ts'), '// deep route');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(1);
		expect(routes[0].mountPath).toBe('/api/v1/admin/system/health/checks');
		expect(routes[0].variableName).toBe('v1AdminSystemHealthChecksRoute');
	});

	test('should generate safe variable names from folder names with hyphens', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(join(apiDir, 'user-management'), { recursive: true });
		mkdirSync(join(apiDir, 'api-keys'), { recursive: true });

		writeFileSync(join(apiDir, 'user-management', 'route.ts'), '// user management');
		writeFileSync(join(apiDir, 'api-keys', 'route.ts'), '// api keys');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(2);

		const userMgmt = routes.find((r) => r.mountPath === '/api/user-management');
		expect(userMgmt!.variableName).toBe('userManagementRoute');

		const apiKeys = routes.find((r) => r.mountPath === '/api/api-keys');
		expect(apiKeys!.variableName).toBe('apiKeysRoute');
	});

	test('should handle empty api directory', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(apiDir, { recursive: true });

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(0);
	});

	test('should handle non-existent api directory', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(0);
	});

	test('should discover ANY .ts filename (not just route.ts)', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(join(apiDir, 'custom'), { recursive: true });
		mkdirSync(join(apiDir, 'service'), { recursive: true });

		// Test various filenames
		writeFileSync(join(apiDir, 'custom', 'foobar.ts'), '// custom file');
		writeFileSync(join(apiDir, 'custom', 'handler.ts'), '// handler file');
		writeFileSync(join(apiDir, 'service', 'index.ts'), '// index file');
		writeFileSync(join(apiDir, 'service', 'api.ts'), '// api file');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(4);

		// Verify all files discovered
		const filenames = routes.map((r) => r.relativePath).sort();
		expect(filenames).toEqual([
			'custom/foobar.ts',
			'custom/handler.ts',
			'service/api.ts',
			'service/index.ts',
		]);

		// Verify variable names
		const foobar = routes.find((r) => r.relativePath === 'custom/foobar.ts');
		expect(foobar!.variableName).toBe('customFoobarRoute');

		const handler = routes.find((r) => r.relativePath === 'custom/handler.ts');
		expect(handler!.variableName).toBe('customHandlerRoute');

		const index = routes.find((r) => r.relativePath === 'service/index.ts');
		expect(index!.variableName).toBe('serviceRoute'); // index doesn't add to name

		const api = routes.find((r) => r.relativePath === 'service/api.ts');
		expect(api!.variableName).toBe('serviceApiRoute');
	});

	test('should mount custom filenames at correct paths', () => {
		const apiDir = join(TEST_DIR, 'src', 'api');
		mkdirSync(join(apiDir, 'admin'), { recursive: true });

		writeFileSync(join(apiDir, 'admin', 'users.ts'), '// users file');
		writeFileSync(join(apiDir, 'admin', 'settings.ts'), '// settings file');

		const routes = discoverRouteFiles(apiDir);

		expect(routes).toHaveLength(2);

		// Both should be mounted at /api/admin (directory name, not file name)
		expect(routes.every((r) => r.mountPath === '/api/admin')).toBe(true);

		// But have different variable names
		const users = routes.find((r) => r.relativePath === 'admin/users.ts');
		expect(users!.variableName).toBe('adminUsersRoute');

		const settings = routes.find((r) => r.relativePath === 'admin/settings.ts');
		expect(settings!.variableName).toBe('adminSettingsRoute');
	});
});

describe('Route Conflict Detection', () => {
	test('should detect duplicate routes', () => {
		const routes = [
			{ method: 'get', path: '/users', filename: 'file1.ts' },
			{ method: 'get', path: '/users', filename: 'file2.ts' },
			{ method: 'post', path: '/orders', filename: 'file3.ts' },
		];

		const conflicts = detectRouteConflicts(routes);

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].type).toBe('duplicate');
		expect(conflicts[0].routes).toHaveLength(2);
		expect(conflicts[0].message).toContain('GET /users');
	});

	test('should allow same path with different methods', () => {
		const routes = [
			{ method: 'get', path: '/users', filename: 'file1.ts' },
			{ method: 'post', path: '/users', filename: 'file2.ts' },
			{ method: 'delete', path: '/users/:id', filename: 'file3.ts' },
		];

		const conflicts = detectRouteConflicts(routes);

		expect(conflicts).toHaveLength(0);
	});

	test('should detect ambiguous parameter routes', () => {
		const routes = [
			{ method: 'get', path: '/users/:id', filename: 'file1.ts' },
			{ method: 'get', path: '/users/:userId', filename: 'file2.ts' },
		];

		const conflicts = detectRouteConflicts(routes);

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].type).toBe('ambiguous-param');
		expect(conflicts[0].message).toContain(':id');
		expect(conflicts[0].message).toContain(':userId');
	});

	test('should not flag same param name as conflict', () => {
		const routes = [
			{ method: 'get', path: '/users/:id', filename: 'file1.ts' },
			{ method: 'post', path: '/orders/:id', filename: 'file2.ts' },
		];

		const conflicts = detectRouteConflicts(routes);

		// Different base paths, no conflict
		expect(conflicts).toHaveLength(0);
	});

	test('should handle complex path patterns', () => {
		const routes = [
			{ method: 'get', path: '/api/v1/users/:id', filename: 'file1.ts' },
			{ method: 'get', path: '/api/v1/users/:userId', filename: 'file2.ts' },
			{ method: 'get', path: '/api/v2/users/:id', filename: 'file3.ts' },
		];

		const conflicts = detectRouteConflicts(routes);

		// Should detect conflict in v1 routes only
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].routes).toHaveLength(2);
		expect(conflicts[0].routes.every((r) => r.path.includes('/v1/'))).toBe(true);
	});

	test('should handle multiple conflicts', () => {
		const routes = [
			{ method: 'get', path: '/users', filename: 'file1.ts' },
			{ method: 'get', path: '/users', filename: 'file2.ts' },
			{ method: 'post', path: '/orders', filename: 'file3.ts' },
			{ method: 'post', path: '/orders', filename: 'file4.ts' },
		];

		const conflicts = detectRouteConflicts(routes);

		expect(conflicts).toHaveLength(2);
		expect(conflicts.every((c) => c.type === 'duplicate')).toBe(true);
	});
});
