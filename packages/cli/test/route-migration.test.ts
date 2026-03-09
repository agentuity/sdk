import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	detectFileBasedRoutes,
	checkMigrationEligibility,
	performMigration,
} from '../src/utils/route-migration';

const createTestDir = () =>
	join(tmpdir(), `route-migration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe('Route Migration - Detection', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('detects route files with createRouter', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
export default router;`
		);

		const files = detectFileBasedRoutes(testDir);
		expect(files).toEqual(['users.ts']);
	});

	test('detects route files with new Hono()', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { Hono } from 'hono';
const router = new Hono();
router.get('/', (c) => c.text('OK'));
export default router;`
		);

		const files = detectFileBasedRoutes(testDir);
		expect(files).toEqual(['health.ts']);
	});

	test('ignores files without routers', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'utils.ts'),
			`export function helper() { return 42; }`
		);

		const files = detectFileBasedRoutes(testDir);
		expect(files).toHaveLength(0);
	});

	test('ignores files that import createRouter but do not export a router', () => {
		// A helper file that references createRouter in a comment or import
		writeFileSync(
			join(testDir, 'src', 'api', 'helpers.ts'),
			`// This file uses createRouter internally but does not export a default router
import { createRouter } from '@agentuity/runtime';

export function makeRouter() {
	return createRouter();
}`
		);

		const files = detectFileBasedRoutes(testDir);
		expect(files).toHaveLength(0);
	});

	test('ignores barrel files that re-export but do not create routers', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'barrel.ts'),
			`export { default } from './users';\n// uses createRouter pattern`
		);

		const files = detectFileBasedRoutes(testDir);
		expect(files).toHaveLength(0);
	});

	test('detects nested route files', () => {
		mkdirSync(join(testDir, 'src', 'api', 'auth'), { recursive: true });
		mkdirSync(join(testDir, 'src', 'api', 'users'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'auth', 'route.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.post('/login', (c) => c.json({}));
export default router;`
		);

		writeFileSync(
			join(testDir, 'src', 'api', 'users', 'route.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
export default router;`
		);

		const files = detectFileBasedRoutes(testDir);
		expect(files.sort()).toEqual(['auth/route.ts', 'users/route.ts']);
	});

	test('returns empty array when no src/api directory exists', () => {
		const emptyDir = createTestDir();
		mkdirSync(emptyDir, { recursive: true });

		const files = detectFileBasedRoutes(emptyDir);
		expect(files).toHaveLength(0);

		rmSync(emptyDir, { recursive: true, force: true });
	});
});

describe('Route Migration - Eligibility', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('not eligible with fewer than 2 route files', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.text('hi'));
export default router;`
		);

		const result = checkMigrationEligibility(testDir);
		expect(result.available).toBe(false);
	});

	test('eligible with 2+ route files', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.text('OK'));
export default router;`
		);

		const result = checkMigrationEligibility(testDir);
		expect(result.available).toBe(true);
		expect(result.routeFiles).toHaveLength(2);
		expect(result.alreadyNotified).toBe(false);
	});

	test('not eligible when consolidated root router already exists', () => {
		// An index.ts that imports and mounts sub-routers = already consolidated
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
import usersRouter from './users';
const router = createRouter();
router.route('/users', usersRouter);
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
export default router;`
		);

		const result = checkMigrationEligibility(testDir);
		expect(result.available).toBe(false);
	});
});

describe('Route Migration - Perform Migration', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('generates src/api/index.ts that imports and mounts all route files', () => {
		mkdirSync(join(testDir, 'src', 'api', 'auth'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'auth', 'route.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.post('/login', (c) => c.json({}));
export default router;`
		);

		const routeFiles = ['users.ts', 'auth/route.ts'];
		const result = performMigration(testDir, routeFiles);

		expect(result.success).toBe(true);
		expect(result.filesCreated).toContain('src/api/index.ts');
		expect(result.filesModified).toHaveLength(0);

		// Verify generated content
		const indexContent = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(indexContent).toContain("import { createRouter } from '@agentuity/runtime'");
		expect(indexContent).toContain("import router_0 from './auth/route'");
		expect(indexContent).toContain("import router_1 from './users'");
		expect(indexContent).toContain("router.route('/auth', router_0)");
		expect(indexContent).toContain("router.route('/users', router_1)");
		expect(indexContent).toContain('export default router');
	});

	test('does not overwrite existing src/api/index.ts with a router', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/custom', (c) => c.text('custom'));
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['index.ts', 'users.ts']);

		expect(result.success).toBe(false);
		expect(result.message).toContain('already exists');

		// Verify original file untouched
		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain('/custom');
	});

	test('does not overwrite existing src/api/index.ts even if not a router', () => {
		// A barrel file or helper — must never be silently replaced
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`export { helper } from './utils';\nexport const API_VERSION = '1.0';`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['users.ts', 'health.ts']);

		expect(result.success).toBe(false);
		expect(result.message).toContain('already exists');

		// Verify barrel file untouched
		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain('API_VERSION');
	});

	test('filters out index.ts from mounted routes', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.text('OK'));
export default router;`
		);

		// Include index.ts in the list (as if detected) — it should be filtered out
		const result = performMigration(testDir, ['index.ts', 'health.ts']);

		expect(result.success).toBe(true);
		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// Should only import health, not index (itself)
		expect(content).toContain("import router_0 from './health'");
		expect(content).not.toContain("from './index'");
	});

	test('does not modify app.ts', () => {
		const appContent = `import { createApp } from '@agentuity/runtime';
const app = await createApp({
	setup: async () => ({ db: null }),
});
export { app };`;

		writeFileSync(join(testDir, 'app.ts'), appContent);
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['users.ts', 'health.ts']);

		expect(result.success).toBe(true);
		expect(result.filesModified).toHaveLength(0);

		// app.ts must be untouched
		const afterContent = readFileSync(join(testDir, 'app.ts'), 'utf-8');
		expect(afterContent).toBe(appContent);
	});

	test('existing route files are not modified', () => {
		const usersContent = `import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json({ users: [] }));
router.post('/', async (c) => {
	const body = await c.req.json();
	return c.json({ created: body });
});
export default router;`;

		writeFileSync(join(testDir, 'src', 'api', 'users.ts'), usersContent);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.text('OK'));
export default router;`
		);

		performMigration(testDir, ['users.ts', 'health.ts']);

		// Verify users.ts is byte-for-byte unchanged
		const afterContent = readFileSync(join(testDir, 'src', 'api', 'users.ts'), 'utf-8');
		expect(afterContent).toBe(usersContent);
	});

	test('writes migration state sentinel file', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'a.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'b.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['a.ts', 'b.ts']);

		const sentinelPath = join(testDir, '.agentuity', '.route-migration-state');
		expect(existsSync(sentinelPath)).toBe(true);

		const state = JSON.parse(readFileSync(sentinelPath, 'utf-8'));
		expect(state.state).toBe('migrated');
		expect(typeof state.timestamp).toBe('number');
	});
});

describe('Route Migration - File-based routing compatibility', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('generated index.ts is parseable by the existing route discovery AST', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');

		// Set up existing route files
		mkdirSync(join(testDir, 'src', 'api', 'auth'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
router.get('/:id', (c) => c.json({}));
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'auth', 'route.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.post('/login', (c) => c.json({}));
export default router;`
		);

		// Perform migration
		const result = performMigration(testDir, ['users.ts', 'auth/route.ts']);
		expect(result.success).toBe(true);

		// The generated index.ts must be parseable by the existing AST parser
		const indexPath = join(testDir, 'src', 'api', 'index.ts');
		const routes = await parseRoute(testDir, indexPath, 'proj_1', 'dep_1');

		// parseRoute should find the sub-router mounts
		expect(routes.length).toBeGreaterThan(0);
	});

	test('existing route files remain independently parseable after migration', async () => {
		const { parseRoute } = await import('../src/cmd/build/ast');

		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
router.post('/', async (c) => c.json({}));
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.text('OK'));
export default router;`
		);

		// Parse before migration
		const userRoutesBefore = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'users.ts'),
			'proj_1',
			'dep_1'
		);
		const healthRoutesBefore = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'health.ts'),
			'proj_1',
			'dep_1'
		);

		// Perform migration
		performMigration(testDir, ['users.ts', 'health.ts']);

		// Parse after migration — should produce identical results
		const userRoutesAfter = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'users.ts'),
			'proj_1',
			'dep_1'
		);
		const healthRoutesAfter = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'health.ts'),
			'proj_1',
			'dep_1'
		);

		expect(userRoutesAfter).toEqual(userRoutesBefore);
		expect(healthRoutesAfter).toEqual(healthRoutesBefore);
	});

	test('entry generator works with consolidated routes', async () => {
		const { generateEntryFile } = await import('../src/cmd/build/entry-generator');
		const { createMockLogger } = await import('@agentuity/test-utils');
		const logger = createMockLogger();

		mkdirSync(join(testDir, 'src', 'generated'), { recursive: true });

		// Set up route files
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.text('OK'));
export default router;`
		);

		// Perform migration first
		performMigration(testDir, ['users.ts', 'health.ts']);

		// Generate entry file — should work without errors
		await generateEntryFile({
			rootDir: testDir,
			projectId: 'test-project',
			deploymentId: 'test-deployment',
			logger,
			mode: 'prod',
		});

		const entryContent = await Bun.file(join(testDir, 'src', 'generated', 'app.ts')).text();

		// The entry file should contain route mounts
		expect(entryContent).toContain('app.route(');
		// It should import from the api directory
		expect(entryContent).toContain('../api/');
	});
});

describe('Route Migration - Mount path generation', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('maps top-level files to correct mount paths', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['users.ts', 'health.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain("router.route('/health'");
		expect(content).toContain("router.route('/users'");
	});

	test('maps subdirectory files to correct mount paths', () => {
		mkdirSync(join(testDir, 'src', 'api', 'auth'), { recursive: true });
		mkdirSync(join(testDir, 'src', 'api', 'users', 'profile'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'auth', 'route.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users', 'profile', 'route.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['auth/route.ts', 'users/profile/route.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain("router.route('/auth'");
		expect(content).toContain("router.route('/users/profile'");
	});

	test('maps index.ts and route.ts in subdirs to directory mount paths', () => {
		mkdirSync(join(testDir, 'src', 'api', 'v1'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'v1', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'other.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['v1/index.ts', 'other.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain("router.route('/other'");
		expect(content).toContain("router.route('/v1'");
	});

	test('preserves filename segment for named files in subdirectories', () => {
		mkdirSync(join(testDir, 'src', 'api', 'users'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'users', 'profile.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users', 'settings.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['users/profile.ts', 'users/settings.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// Named files in subdirs should include the filename: /users/profile, /users/settings
		expect(content).toContain("router.route('/users/profile'");
		expect(content).toContain("router.route('/users/settings'");
	});
});
