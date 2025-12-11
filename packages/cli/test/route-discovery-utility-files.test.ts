import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverRouteFiles } from '../src/cmd/build/route-discovery';
import { parseRoute } from '../src/cmd/build/ast';

describe('Route discovery with utility files', () => {
	let tempDir: string;
	let apiDir: string;

	beforeEach(() => {
		tempDir = join(import.meta.dir, '.test-api-util-' + Date.now());
		apiDir = join(tempDir, 'src', 'api');
		mkdirSync(apiDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('should discover but gracefully skip utility files without default exports', () => {
		// Create a route directory with a utility file
		const authDir = join(apiDir, 'auth');
		mkdirSync(authDir, { recursive: true });

		// Create route file with proper default export
		const routeFile = join(authDir, 'route.ts');
		writeFileSync(
			routeFile,
			`
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.post('/login', async (c) => {
	return c.json({ success: true });
});

export default router;
		`.trim()
		);

		// Create utility file WITHOUT default export (should be discovered but skipped during processing)
		const utilFile = join(authDir, 'utils.ts');
		writeFileSync(
			utilFile,
			`
export function hashPassword(password: string): string {
	return 'hashed-' + password;
}

export function validateEmail(email: string): boolean {
	return email.includes('@');
}
		`.trim()
		);

		// Discover routes - both files are discovered
		const routes = discoverRouteFiles(apiDir);
		expect(routes.length).toBe(2);

		// Both files should be discovered
		const routeEntry = routes.find((r) => r.relativePath.includes('route.ts'));
		const utilEntry = routes.find((r) => r.relativePath.includes('utils.ts'));

		expect(routeEntry).toBeDefined();
		expect(utilEntry).toBeDefined();

		// Both have the same mount path
		expect(routeEntry!.mountPath).toBe('/api/auth');
		expect(utilEntry!.mountPath).toBe('/api/auth');

		// The plugin.ts error handler will skip utils.ts during processing
		// because parseRoute will throw InvalidExportError for it
	});

	test('parseRoute should fail on utility file without default export', async () => {
		const authDir = join(apiDir, 'auth');
		mkdirSync(authDir, { recursive: true });

		const utilFile = join(authDir, 'utils.ts');
		writeFileSync(
			utilFile,
			`
export function hashPassword(password: string): string {
	return 'hashed-' + password;
}
		`.trim()
		);

		// This should throw because utils.ts has no default export
		await expect(
			parseRoute(tempDir, utilFile, 'test-project', 'test-deployment')
		).rejects.toThrow(/could not find default export/);
	});

	test('should discover all files but plugin will skip utility files during processing', () => {
		// Create auth directory with multiple utility files
		const authDir = join(apiDir, 'auth');
		mkdirSync(authDir, { recursive: true });

		writeFileSync(join(authDir, 'route.ts'), 'export default {}');
		writeFileSync(join(authDir, 'types.ts'), 'export type User = {}');
		writeFileSync(join(authDir, 'constants.ts'), 'export const MAX_ATTEMPTS = 3');
		writeFileSync(join(authDir, 'helpers.ts'), 'export function helper() {}');
		writeFileSync(join(authDir, 'validation.ts'), 'export const validate = () => {}');

		const routes = discoverRouteFiles(apiDir);

		// All files are discovered
		expect(routes.length).toBe(5);

		const fileNames = routes.map((r) => r.relativePath.split('/').pop());
		expect(fileNames).toContain('route.ts');
		expect(fileNames).toContain('types.ts');
		expect(fileNames).toContain('constants.ts');
		expect(fileNames).toContain('helpers.ts');
		expect(fileNames).toContain('validation.ts');

		// The plugin.ts will skip utility files via string search for 'createRouter'/'Hono'
	});

	test('should handle deeply nested utility files', () => {
		// Create nested structure: src/api/v1/users/profile/
		const profileDir = join(apiDir, 'v1', 'users', 'profile');
		mkdirSync(profileDir, { recursive: true });

		writeFileSync(join(profileDir, 'route.ts'), 'export default {}');
		writeFileSync(join(profileDir, 'schema.ts'), 'export const schema = {}');
		writeFileSync(join(profileDir, 'middleware.ts'), 'export const auth = () => {}');

		const routes = discoverRouteFiles(apiDir);

		// All files discovered
		expect(routes.length).toBe(3);

		// All have the same mount path
		const mountPaths = [...new Set(routes.map((r) => r.mountPath))];
		expect(mountPaths).toEqual(['/api/v1/users/profile']);
	});

	test('should discover all .ts files with various naming conventions', () => {
		const apiAuthDir = join(apiDir, 'auth');
		mkdirSync(apiAuthDir, { recursive: true });

		// Different naming patterns - all should be discovered
		writeFileSync(join(apiAuthDir, 'route.ts'), 'export default {}');
		writeFileSync(join(apiAuthDir, 'auth.service.ts'), 'export class AuthService {}');
		writeFileSync(join(apiAuthDir, 'auth.config.ts'), 'export const config = {}');
		writeFileSync(join(apiAuthDir, 'index.ts'), 'export * from "./utils"');
		writeFileSync(join(apiAuthDir, 'utils.spec.ts'), 'test("test", () => {})');

		const routes = discoverRouteFiles(apiDir);

		// All files should be discovered
		expect(routes.length).toBe(5);

		const fileNames = routes.map((r) => r.relativePath.split('/').pop());
		expect(fileNames).toContain('route.ts');
		expect(fileNames).toContain('index.ts');
		expect(fileNames).toContain('auth.service.ts');
		expect(fileNames).toContain('auth.config.ts');
		expect(fileNames).toContain('utils.spec.ts');
	});
});
