import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { parseRoute } from '../../../src/cmd/build/ast';

const createTestDir = () => {
	const dir = join(
		import.meta.dir,
		`.test-parse-route-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	mkdirSync(dir, { recursive: true });
	return dir;
};

describe('parseRoute with mountPrefix', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('uses mountPrefix instead of filesystem-derived path', async () => {
		// File is at src/api/users.ts which would normally mount at /api
		// But we pass mountPrefix: '/v1' to override
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/users', (c) => c.json([]));
router.post('/users', (c) => c.json({}));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'users.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/v1',
			}
		);

		expect(routes).toHaveLength(2);
		expect(routes[0]!.path).toBe('/v1/users');
		expect(routes[0]!.method).toBe('get');
		expect(routes[1]!.path).toBe('/v1/users');
		expect(routes[1]!.method).toBe('post');
	});

	test('mountPrefix works with root path routes', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.text('OK'));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'index.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/api/v2',
			}
		);

		expect(routes).toHaveLength(1);
		expect(routes[0]!.path).toBe('/api/v2');
	});

	test('mountPrefix propagates through .route() sub-routers', async () => {
		mkdirSync(join(testDir, 'src', 'api', 'sub'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'sub', 'auth.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.post('/login', (c) => c.json({}));
router.post('/logout', (c) => c.json({}));
export default router;`
		);

		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
import auth from './sub/auth';
const router = createRouter();
router.route('/auth', auth);
router.get('/health', (c) => c.text('OK'));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'index.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/api/v1',
			}
		);

		expect(routes.length).toBeGreaterThanOrEqual(3);

		const paths = routes.map((r) => `${r.method} ${r.path}`).sort();
		expect(paths).toContain('get /api/v1/health');
		expect(paths).toContain('post /api/v1/auth/login');
		expect(paths).toContain('post /api/v1/auth/logout');
	});

	test('sub-router routes carry schemaSourceFile for schema import resolution', async () => {
		mkdirSync(join(testDir, 'src', 'api', 'sub'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'sub', 'agents.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
router.post('/search', (c) => c.json({}));
export default router;`
		);

		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
import agents from './sub/agents';
const router = createRouter();
router.route('/agents', agents);
router.get('/health', (c) => c.text('OK'));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'index.ts'),
			'proj',
			'dep',
			{ mountPrefix: '/api' }
		);

		// The /health route is defined in index.ts — filename is index.ts, no schemaSourceFile
		const healthRoute = routes.find((r) => r.path === '/api/health');
		expect(healthRoute).toBeDefined();
		expect(healthRoute!.filename).toBe('src/api/index.ts');
		expect(healthRoute!.config?.schemaSourceFile).toBeUndefined();

		// The agents routes are mounted via .route() — filename is the parent (index.ts)
		// for dedup, but schemaSourceFile points to the actual sub-router file
		const agentRoutes = routes.filter((r) => r.path.includes('/agents'));
		expect(agentRoutes.length).toBe(2);
		for (const route of agentRoutes) {
			expect(route.filename).toBe('src/api/index.ts');
			expect(route.config?.schemaSourceFile).toBe('src/api/sub/agents.ts');
		}
	});

	test('without mountPrefix falls back to filesystem-derived path', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/list', (c) => c.json([]));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'users.ts'),
			'proj',
			'dep'
		);

		expect(routes).toHaveLength(1);
		// Without mountPrefix, filesystem path src/api/users.ts → /api
		expect(routes[0]!.path).toBe('/api/list');
	});
});

describe('parseRoute with chained calls', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('extracts routes from chained createRouter().get().post()', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'users.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter()
	.get('/users', (c) => c.json([]))
	.post('/users', (c) => c.json({}))
	.delete('/users/:id', (c) => c.json({ deleted: true }));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'users.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/api',
			}
		);

		expect(routes).toHaveLength(3);
		const methods = routes.map((r) => r.method).sort();
		expect(methods).toEqual(['delete', 'get', 'post']);

		expect(routes.find((r) => r.method === 'get')!.path).toBe('/api/users');
		expect(routes.find((r) => r.method === 'delete')!.path).toBe('/api/users/:id');
	});

	test('chained .route() follows sub-router imports', async () => {
		mkdirSync(join(testDir, 'src', 'api', 'sub'), { recursive: true });

		writeFileSync(
			join(testDir, 'src', 'api', 'sub', 'posts.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', (c) => c.json([]));
router.get('/:id', (c) => c.json({}));
export default router;`
		);

		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
import posts from './sub/posts';
const router = createRouter()
	.get('/health', (c) => c.text('OK'))
	.route('/posts', posts);
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'index.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/api',
			}
		);

		expect(routes.length).toBeGreaterThanOrEqual(3);
		const paths = routes.map((r) => `${r.method} ${r.path}`).sort();
		expect(paths).toContain('get /api/health');
		expect(paths).toContain('get /api/posts');
		expect(paths).toContain('get /api/posts/:id');
	});

	test('chained calls work with mountPrefix', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter()
	.get('/users', (c) => c.json([]))
	.post('/users', (c) => c.json({}));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'index.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/api/v2',
			}
		);

		expect(routes).toHaveLength(2);
		expect(routes[0]!.path).toBe('/api/v2/users');
		expect(routes[1]!.path).toBe('/api/v2/users');
	});

	test('mixed imperative and chained calls both produce routes', async () => {
		// Some routes on the chain, some as separate statements
		writeFileSync(
			join(testDir, 'src', 'api', 'mixed.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter()
	.get('/chained', (c) => c.text('chained'));
router.post('/imperative', (c) => c.text('imperative'));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'mixed.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/api',
			}
		);

		expect(routes).toHaveLength(2);
		const paths = routes.map((r) => `${r.method} ${r.path}`).sort();
		expect(paths).toContain('get /api/chained');
		expect(paths).toContain('post /api/imperative');
	});

	test('chained calls skip middleware methods (use, onError, notFound)', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter()
	.use('/*', (c, next) => next())
	.get('/data', (c) => c.json({}));
export default router;`
		);

		const routes = await parseRoute(
			testDir,
			join(testDir, 'src', 'api', 'index.ts'),
			'proj',
			'dep',
			{
				mountPrefix: '/api',
			}
		);

		// Only the .get() should be extracted, not .use()
		expect(routes).toHaveLength(1);
		expect(routes[0]!.method).toBe('get');
		expect(routes[0]!.path).toBe('/api/data');
	});
});
