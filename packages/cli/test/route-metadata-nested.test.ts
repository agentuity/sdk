import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Use the integration suite's built metadata since it has nested routes
const INTEGRATION_SUITE_DIR = join(
	__dirname,
	'..',
	'..',
	'..',
	'apps',
	'testing',
	'integration-suite'
);
const METADATA_PATH = join(INTEGRATION_SUITE_DIR, '.agentuity', 'agentuity.metadata.json');

interface Route {
	method: string;
	path: string;
	filename: string;
}

interface Metadata {
	routes: Route[];
}

// Check if metadata file exists before running tests
function ensureMetadataExists() {
	if (!existsSync(METADATA_PATH)) {
		throw new Error(
			'Integration suite metadata not found. ' +
				'Build integration-suite first: cd apps/testing/integration-suite && bun run build'
		);
	}
}

describe('Route Metadata - Nested Routes', () => {
	test('integration suite should have metadata file', () => {
		ensureMetadataExists();
		expect(existsSync(METADATA_PATH)).toBe(true);
	});

	test('metadata.json should contain routes with correct nested paths', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		expect(metadata.routes).toBeDefined();
		expect(Array.isArray(metadata.routes)).toBe(true);

		// Extract route paths
		const routes: Route[] = metadata.routes.map((r) => ({
			method: r.method,
			path: r.path,
			filename: r.filename,
		}));

		// 1-level deep routes (auth)
		const loginRoute = routes.find((r) => r.path === '/api/auth/login');
		expect(loginRoute).toBeDefined();
		expect(loginRoute!.method).toBe('post');
		expect(loginRoute!.filename).toBe('src/api/auth/route.ts');

		const logoutRoute = routes.find((r) => r.path === '/api/auth/logout');
		expect(logoutRoute).toBeDefined();
		expect(logoutRoute!.method).toBe('post');
		expect(logoutRoute!.filename).toBe('src/api/auth/route.ts');

		// 2-level deep routes (users/profile)
		const profileGetRoute = routes.find((r) => r.path === '/api/users/profile');
		expect(profileGetRoute).toBeDefined();
		expect(profileGetRoute!.method).toBe('get');
		expect(profileGetRoute!.filename).toBe('src/api/users/profile/route.ts');

		const profilePatchRoute = routes.find(
			(r) => r.path === '/api/users/profile' && r.method === 'patch'
		);
		expect(profilePatchRoute).toBeDefined();
		expect(profilePatchRoute!.filename).toBe('src/api/users/profile/route.ts');

		const profileDeleteRoute = routes.find(
			(r) => r.path === '/api/users/profile' && r.method === 'delete'
		);
		expect(profileDeleteRoute).toBeDefined();
		expect(profileDeleteRoute!.filename).toBe('src/api/users/profile/route.ts');
	});

	test('metadata.json nested route paths should be correct', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		const routes = metadata.routes.filter(
			(r) =>
				r.filename.startsWith('src/api/') &&
				r.filename !== 'src/api/test.ts' && // test.ts has hardcoded /api paths (known issue)
				r.filename !== 'src/api/hello.ts' &&
				!r.path.startsWith('/workbench')
		);

		// All filtered routes should start with /api and not have duplicate /api prefixes
		for (const route of routes) {
			expect(route.path).toMatch(/^\/api\/[^/]/);
			expect(route.path).not.toContain('/api/api');
		}
	});

	test('metadata.json should have correct filename paths for nested routes', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		// All filenames should be relative to project root
		const allFilenames = metadata.routes.map((r) => r.filename);

		// Check they all start with src/api
		const allInSrcApi = allFilenames
			.filter((f) => !f.includes('workbench'))
			.every((f) => f.startsWith('src/api'));
		expect(allInSrcApi).toBe(true);

		// Check nested paths are preserved
		const nestedFile = allFilenames.find((f) => f === 'src/api/users/profile/route.ts');
		expect(nestedFile).toBeDefined();
	});

	test('metadata.json nested routes should have full path from src/api', () => {
		ensureMetadataExists();
		const metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));

		// Find a nested route
		const nestedRoute = metadata.routes.find(
			(r) => r.filename === 'src/api/users/profile/route.ts'
		);

		expect(nestedRoute).toBeDefined();
		// Path should include the full nested structure: /api/users/profile
		expect(nestedRoute!.path).toContain('/api/users/profile');
		// Should NOT be just /api/profile (which would happen if only basename was used)
		expect(nestedRoute!.path).not.toBe('/api/profile');
	});
});
