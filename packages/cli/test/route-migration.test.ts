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

	test('not eligible when explicit root router has all routes imported', () => {
		// An index.ts that imports and mounts all sub-routers = already using explicit routing
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

	test('eligible when explicit root router is missing some routes', () => {
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
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = checkMigrationEligibility(testDir);
		expect(result.available).toBe(true);
		// Should include health.ts (not yet imported) and others
		expect(result.routeFiles.length).toBeGreaterThanOrEqual(2);
	});

	test('not eligible when migration state is "migrated"', () => {
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

		// Simulate a completed migration by writing the sentinel file
		const stateDir = join(testDir, '.agentuity');
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(
			join(stateDir, '.route-migration-state'),
			JSON.stringify({ state: 'migrated', timestamp: new Date().toISOString() })
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

		// Verify generated content uses descriptive import names
		const indexContent = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(indexContent).toContain("import { createRouter } from '@agentuity/runtime'");
		expect(indexContent).toContain("import authRouter from './auth/route'");
		expect(indexContent).toContain("import usersRouter from './users'");
		expect(indexContent).toContain("router.route('/auth', authRouter)");
		expect(indexContent).toContain("router.route('/users', usersRouter)");
		expect(indexContent).toContain('export default router');
	});

	test('merges new routes into existing src/api/index.ts with a router', () => {
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

		expect(result.success).toBe(true);
		expect(result.filesModified).toContain('src/api/index.ts');
		expect(result.filesCreated).toHaveLength(0);

		// Verify original content preserved AND new import/mount added
		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain('/custom');
		expect(content).toContain("import usersRouter from './users'");
		expect(content).toContain("router.route('/users', usersRouter)");
	});

	test('merges into existing index.ts without duplicating already-imported routes', () => {
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
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['index.ts', 'users.ts', 'health.ts']);

		expect(result.success).toBe(true);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// health should be added
		expect(content).toContain("import healthRouter from './health'");
		expect(content).toContain("router.route('/health', healthRouter)");
		// users import should appear only once (the original)
		const usersImportCount = (content.match(/import.*from '\.\/users'/g) || []).length;
		expect(usersImportCount).toBe(1);
	});

	test('reports no changes when all routes already imported', () => {
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
export default router;`
		);

		const result = performMigration(testDir, ['index.ts', 'users.ts']);

		expect(result.success).toBe(true);
		expect(result.filesModified).toHaveLength(0);
		expect(result.message).toContain('already imported');
	});

	test('merges into non-router index.ts (barrel file)', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`export { helper } from './utils';
export const API_VERSION = '1.0';

export default {};`
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

		expect(result.success).toBe(true);
		expect(result.filesModified).toContain('src/api/index.ts');

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// Original content preserved
		expect(content).toContain('API_VERSION');
		// New imports and mounts added
		expect(content).toContain("import healthRouter from './health'");
		expect(content).toContain("import usersRouter from './users'");
		expect(content).toContain("router.route('/health', healthRouter)");
		expect(content).toContain("router.route('/users', usersRouter)");
	});

	test('uses existing router variable name when merging (not hardcoded "router")', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';

const api = createRouter();
api.get('/custom', (c) => c.text('custom'));

export default api;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['index.ts', 'users.ts']);

		expect(result.success).toBe(true);
		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// Should use 'api' variable name, not 'router'
		expect(content).toContain("api.route('/users', usersRouter)");
		expect(content).not.toContain("router.route('/users'");
	});

	test('detects router variable from new Hono() pattern', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { Hono } from 'hono';

const app = new Hono();
app.get('/ping', (c) => c.text('pong'));

export default app;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'auth.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['index.ts', 'auth.ts']);

		expect(result.success).toBe(true);
		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain("app.route('/auth', authRouter)");
		expect(content).not.toContain('router.route(');
	});

	test('detects router variable from existing .route() calls', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
import usersRouter from './users';

const myApi = createRouter();
myApi.route('/users', usersRouter);

export default myApi;`
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

		const result = performMigration(testDir, ['index.ts', 'users.ts', 'health.ts']);

		expect(result.success).toBe(true);
		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// Should use 'myApi' from the existing .route() call pattern
		expect(content).toContain("myApi.route('/health', healthRouter)");
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
		expect(content).toContain("import healthRouter from './health'");
		expect(content).not.toContain("from './index'");
	});

	test('updates root app.ts with router import using ./src/api/index path', () => {
		writeFileSync(
			join(testDir, 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const app = await createApp();`
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

		expect(result.success).toBe(true);
		expect(result.filesModified).toContain('app.ts');

		const appContent = readFileSync(join(testDir, 'app.ts'), 'utf-8');
		// Root app.ts uses ./src/api/index (not ./api/index)
		expect(appContent).toContain("import router from './src/api/index'");
		expect(appContent).toContain('createApp({ router })');
	});

	test('updates src/app.ts with router import using ./api/index path', () => {
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const app = await createApp();`
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

		expect(result.success).toBe(true);
		expect(result.filesModified).toContain('src/app.ts');

		const appContent = readFileSync(join(testDir, 'src', 'app.ts'), 'utf-8');
		// src/app.ts uses ./api/index (sibling to src/api/)
		expect(appContent).toContain("import router from './api/index'");
		expect(appContent).toContain('createApp({ router })');
	});

	test('prefers root app.ts over src/app.ts when both exist', () => {
		writeFileSync(
			join(testDir, 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const app = await createApp();`
		);
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const other = await createApp();`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['users.ts']);

		expect(result.success).toBe(true);
		expect(result.filesModified).toContain('app.ts');

		// Root app.ts should be updated
		const rootContent = readFileSync(join(testDir, 'app.ts'), 'utf-8');
		expect(rootContent).toContain("import router from './src/api/index'");
		expect(rootContent).toContain('createApp({ router })');

		// src/app.ts should be untouched
		const srcContent = readFileSync(join(testDir, 'src', 'app.ts'), 'utf-8');
		expect(srcContent).toContain('createApp()');
		expect(srcContent).not.toContain('./api/index');
	});

	test('updates app.ts with existing config properties', () => {
		writeFileSync(
			join(testDir, 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const app = await createApp({ name: 'my-app' });`
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

		expect(result.success).toBe(true);
		const appContent = readFileSync(join(testDir, 'app.ts'), 'utf-8');
		expect(appContent).toContain("import router from './src/api/index'");
		// Router should be added to existing config
		expect(appContent).toContain('createApp({ router,');
		expect(appContent).toContain("name: 'my-app'");
	});

	test('uses non-standard export name from api/index.ts in app.ts import', () => {
		writeFileSync(
			join(testDir, 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const app = await createApp();`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const api = createRouter();
export default api;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		const result = performMigration(testDir, ['index.ts', 'users.ts']);

		expect(result.success).toBe(true);
		const appContent = readFileSync(join(testDir, 'app.ts'), 'utf-8');
		// Should import as 'api' (matching the export name) and use router: api
		expect(appContent).toContain("import api from './src/api/index'");
		expect(appContent).toContain('createApp({ router: api })');
	});

	test('skips app.ts update when router property already exists', () => {
		const originalAppContent = `import { createApp } from '@agentuity/runtime';
import myRouter from './src/api/index';
export const app = await createApp({ router: myRouter });`;

		writeFileSync(join(testDir, 'app.ts'), originalAppContent);
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
		// app.ts should NOT be in filesModified since it already has router
		expect(result.filesModified).not.toContain('app.ts');
		const appContent = readFileSync(join(testDir, 'app.ts'), 'utf-8');
		expect(appContent).toBe(originalAppContent);
	});

	test('does not modify app.ts when createApp is not used', () => {
		const originalAppContent = `import { Hono } from 'hono';
const app = new Hono();
export default app;`;

		writeFileSync(join(testDir, 'app.ts'), originalAppContent);
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
		expect(result.filesModified).not.toContain('app.ts');
		const appContent = readFileSync(join(testDir, 'app.ts'), 'utf-8');
		expect(appContent).toBe(originalAppContent);
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

	test('entry generator works with explicit routes', async () => {
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

	test('sanitizes hyphens in filenames to valid camelCase import names', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'user-profile.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'health-check.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['user-profile.ts', 'health-check.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// Hyphens should be converted to camelCase boundaries
		expect(content).toContain('import userProfileRouter from');
		expect(content).toContain('import healthCheckRouter from');
		// Mount paths keep hyphens (they're valid in URL paths)
		expect(content).toContain("router.route('/user-profile'");
		expect(content).toContain("router.route('/health-check'");
	});

	test('sanitizes underscores in filenames to valid camelCase import names', () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'my_api.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'foo_bar.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['my_api.ts', 'foo_bar.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain('import myApiRouter from');
		expect(content).toContain('import fooBarRouter from');
	});

	test('sanitizes hyphens in subdirectory names', () => {
		mkdirSync(join(testDir, 'src', 'api', 'my-api'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'my-api', 'route.ts'),
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

		performMigration(testDir, ['my-api/route.ts', 'other.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		expect(content).toContain('import myApiRouter from');
		expect(content).toContain("router.route('/my-api'");
	});

	test('handles filenames starting with digits', () => {
		writeFileSync(
			join(testDir, 'src', 'api', '2fa.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'auth.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);

		performMigration(testDir, ['2fa.ts', 'auth.ts']);

		const content = readFileSync(join(testDir, 'src', 'api', 'index.ts'), 'utf-8');
		// Should prefix with underscore to make valid identifier
		expect(content).toContain('import _2faRouter from');
		expect(content).toContain('import authRouter from');
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
