import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import {
	discoverRoutes,
	detectRouteConflicts,
	extractPathParams,
} from '../../../../src/cmd/build/vite/route-discovery.ts';

describe('route-discovery', () => {
	let testDir: string;
	let srcDir: string;
	let apiDir: string;
	const logger = createMockLogger();

	beforeEach(() => {
		// Create unique temp directory for each test
		testDir = join(tmpdir(), `route-discovery-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		apiDir = join(srcDir, 'api');
		mkdirSync(apiDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up temp directory
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should discover basic API route', async () => {
		// Following convention: src/api/users.ts is mounted at /api (directory-based)
		// So router.get('/') maps to /api
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { z } from 'zod';

const router = createRouter();

router.get('/', async (c) => {
	return c.json({ users: [] });
});

export default router;
`;
		writeFileSync(join(apiDir, 'users.ts'), routeCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		expect(routes.length).toBeGreaterThan(0);
		// src/api/users.ts is mounted at /api (directory-based), and router.get('/') maps to /api
		const userRoute = routes.find((r) => r.path === '/api');
		expect(userRoute).toBeDefined();
		expect(userRoute!.method).toBe('get');
		expect(userRoute!.type).toBe('api');
	});

	test('should discover route with validator', async () => {
		// Following convention: src/api/create.ts is mounted at /api (directory-based)
		// So router.post('/') maps to /api
		const routeCode = `
import { createRouter, validator } from '@agentuity/runtime';
import { z } from 'zod';

const router = createRouter();

router.post(
	'/',
	validator({
		input: z.object({ name: z.string() }),
		output: z.object({ id: z.string() }),
	}),
	async (c) => {
		const data = c.req.valid('json');
		return c.json({ id: 'user-' + data.name });
	}
);

export default router;
`;
		writeFileSync(join(apiDir, 'create.ts'), routeCode);

		const { routes, routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		expect(routes.length).toBeGreaterThan(0);
		// src/api/create.ts is mounted at /api (directory-based), and router.post('/') maps to /api
		const createRoute = routeInfoList.find((r) => r.path === '/api');
		expect(createRoute).toBeDefined();
		expect(createRoute!.hasValidator).toBe(true);
		expect(createRoute!.method).toBe('POST');
	});

	test('should discover route with agent validator', async () => {
		// Create agent first
		const agentDir = join(srcDir, 'agent');
		mkdirSync(agentDir);
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('test-agent', {
	schema: {
		input: z.object({ prompt: z.string() }),
		output: z.object({ response: z.string() }),
	},
	handler: async (ctx, input) => {
		return { response: 'Hello' };
	},
});
`;
		writeFileSync(join(agentDir, 'test.ts'), agentCode);

		// Create route using agent validator
		// Following convention: src/api/chat.ts is mounted at /api (directory-based)
		// So router.post('/') maps to /api
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import testAgent from '../agent/test';

const router = createRouter();

router.post('/', testAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	return c.json({ response: data.prompt });
});

export default router;
`;
		writeFileSync(join(apiDir, 'chat.ts'), routeCode);

		const { routes, routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		expect(routes.length).toBeGreaterThan(0);
		// src/api/chat.ts is mounted at /api (directory-based), and router.post('/') maps to /api
		const chatRoute = routeInfoList.find((r) => r.path === '/api');
		expect(chatRoute).toBeDefined();
		expect(chatRoute!.hasValidator).toBe(true);
		expect(chatRoute!.agentVariable).toBe('testAgent');
	});

	test('should discover multiple routes in subdirectories', async () => {
		// Create routes in subdirectory
		const usersDir = join(apiDir, 'users');
		mkdirSync(usersDir);

		// list.ts is in src/api/users/, so it mounts at /api/users
		// router.get('/list') -> /api/users/list
		const listRouteCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/list', async (c) => {
	return c.json({ users: [] });
});

export default router;
`;
		writeFileSync(join(usersDir, 'list.ts'), listRouteCode);

		// create.ts is in src/api/users/, so it mounts at /api/users
		// router.post('/create') -> /api/users/create
		const createRouteCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.post('/create', async (c) => {
	return c.json({ id: '123' });
});

export default router;
`;
		writeFileSync(join(usersDir, 'create.ts'), createRouteCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		expect(routes.length).toBeGreaterThanOrEqual(2);
	});

	test('should discover routes in api/index.ts', async () => {
		// Create index.ts with routes - index.ts is mounted at /api (directory-based)
		// So router.get('/index-route') maps to /api/index-route
		const indexCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/index-route', async (c) => {
	return c.json({ message: 'index' });
});

export default router;
`;
		writeFileSync(join(apiDir, 'index.ts'), indexCode);

		// Create another route - other.ts is also mounted at /api (directory-based)
		// So router.get('/') maps to /api
		const otherCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	return c.json({ message: 'other' });
});

export default router;
`;
		writeFileSync(join(apiDir, 'other.ts'), otherCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Should find /api/index-route from index.ts and /api from other.ts
		const indexRoute = routes.find((r) => r.path === '/api/index-route');
		expect(indexRoute).toBeDefined();

		const otherRoute = routes.find((r) => r.path === '/api');
		expect(otherRoute).toBeDefined();
	});

	test('should return empty array when no api directory exists', async () => {
		// Remove api directory
		rmSync(apiDir, { recursive: true, force: true });

		const { routes, routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		expect(routes).toHaveLength(0);
		expect(routeInfoList).toHaveLength(0);
	});

	test('should skip files without router', async () => {
		// Create valid route - valid.ts is mounted at /api (directory-based)
		// So router.get('/') maps to /api
		const validCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	return c.json({ ok: true });
});

export default router;
`;
		writeFileSync(join(apiDir, 'valid.ts'), validCode);

		// Create file without router
		const utilCode = `
export function helper() {
	return 42;
}
`;
		writeFileSync(join(apiDir, 'util.ts'), utilCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Should only find valid route (with /api prefix)
		expect(routes.length).toBeGreaterThan(0);
		const validRoute = routes.find((r) => r.path === '/api');
		expect(validRoute).toBeDefined();
	});

	test('should not mutate source files (read-only)', async () => {
		const originalCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/readonly', async (c) => {
	return c.json({ readonly: true });
});

export default router;
`;
		const filePath = join(apiDir, 'readonly.ts');
		writeFileSync(filePath, originalCode);

		// Read original file content
		const beforeContent = await Bun.file(filePath).text();

		// Discover routes
		await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Read file content after discovery
		const afterContent = await Bun.file(filePath).text();

		// File should be unchanged
		expect(afterContent).toBe(beforeContent);
		expect(afterContent).toBe(originalCode);
	});

	test('should discover different HTTP methods', async () => {
		// resource.ts is mounted at /api (directory-based)
		// So router.get('/') maps to /api
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => c.json({}));
router.post('/', async (c) => c.json({}));
router.put('/', async (c) => c.json({}));
router.delete('/', async (c) => c.json({}));
router.patch('/', async (c) => c.json({}));

export default router;
`;
		writeFileSync(join(apiDir, 'resource.ts'), routeCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// All routes should have /api path with different methods
		const methods = new Set(routes.filter((r) => r.path === '/api').map((r) => r.method));
		expect(methods.has('get')).toBe(true);
		expect(methods.has('post')).toBe(true);
		expect(methods.has('put')).toBe(true);
		expect(methods.has('delete')).toBe(true);
		expect(methods.has('patch')).toBe(true);
	});

	test('should detect duplicate route paths', async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/users', async (c) => c.json({ version: 1 }));
router.get('/users', async (c) => c.json({ version: 2 }));

export default router;
`;
		writeFileSync(join(apiDir, 'users.ts'), routeCode);

		await expect(
			discoverRoutes(srcDir, 'test-project', 'test-deployment', logger)
		).rejects.toThrow('route conflict');
	});

	test('detectRouteConflicts detects exact duplicates', () => {
		const routes = [
			{ method: 'get', path: '/api/users', filename: 'src/api/users.ts' },
			{ method: 'get', path: '/api/users', filename: 'src/api/users-v2.ts' },
		];

		const conflicts = detectRouteConflicts(routes);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].type).toBe('duplicate');
		expect(conflicts[0].routes).toHaveLength(2);
	});

	test('detectRouteConflicts allows same path with different methods', () => {
		const routes = [
			{ method: 'get', path: '/api/users', filename: 'src/api/users.ts' },
			{ method: 'post', path: '/api/users', filename: 'src/api/users.ts' },
		];

		const conflicts = detectRouteConflicts(routes);
		expect(conflicts).toHaveLength(0);
	});

	test('should discover routes in nested index files', async () => {
		const nestedDir = join(apiDir, 'nested', 'deep');
		mkdirSync(nestedDir, { recursive: true });

		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/nested-index', async (c) => {
	return c.json({ nested: true });
});

export default router;
`;
		writeFileSync(join(nestedDir, 'index.ts'), routeCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Debug: see what routes were found
		const nestedRoutes = routes.filter((r) => r.filename?.includes('nested'));

		// At least one route should be found from the nested index file
		expect(nestedRoutes.length).toBeGreaterThan(0);

		// Route should be discovered from index.ts in nested directory
		const hasNestedRoute = nestedRoutes.some((r) => r.filename?.includes('index.ts'));
		expect(hasNestedRoute).toBe(true);
	});

	test('should ignore utility files and non-route exports', async () => {
		// Create a utility file that exports helpers but not a router
		const utilCode = `
export const formatUser = (name: string) => ({ name });
export const validateEmail = (email: string) => email.includes('@');
`;
		writeFileSync(join(apiDir, 'utils.ts'), utilCode);

		// Create a types file
		const typesCode = `
export interface User {
	id: string;
	name: string;
}
`;
		writeFileSync(join(apiDir, 'types.ts'), typesCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Should not find any routes from these utility files
		const utilRoute = routes.find((r) => r.filename?.includes('utils.ts'));
		const typesRoute = routes.find((r) => r.filename?.includes('types.ts'));

		expect(utilRoute).toBeUndefined();
		expect(typesRoute).toBeUndefined();
	});

	test('should handle files with multiple routers exported', async () => {
		// multi.ts is mounted at /api (directory-based)
		// So router.get('/public') maps to /api/public
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const publicRouter = createRouter();
publicRouter.get('/public', async (c) => c.json({ public: true }));

const adminRouter = createRouter();
adminRouter.get('/admin', async (c) => c.json({ admin: true }));

export default publicRouter;
export { adminRouter };
`;
		writeFileSync(join(apiDir, 'multi.ts'), routeCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Should discover the default export router at minimum
		const publicRoute = routes.find((r) => r.path === '/api/public');
		expect(publicRoute).toBeDefined();

		// Note: Named export discovery depends on implementation
		// At minimum, default export should work
	});

	describe('extractPathParams', () => {
		test('should extract single path parameter', () => {
			expect(extractPathParams('/users/:id')).toEqual(['id']);
		});

		test('should extract multiple path parameters', () => {
			expect(extractPathParams('/organizations/:orgId/members/:memberId')).toEqual([
				'orgId',
				'memberId',
			]);
		});

		test('should handle optional path parameters', () => {
			expect(extractPathParams('/users/:userId?')).toEqual(['userId']);
		});

		test('should handle wildcard path parameters', () => {
			expect(extractPathParams('/files/*path')).toEqual(['path']);
		});

		test('should handle one-or-more path parameters', () => {
			expect(extractPathParams('/items/:itemId+')).toEqual(['itemId']);
		});

		test('should handle mixed path and static segments', () => {
			expect(extractPathParams('/api/v1/users/:id/posts/:postId')).toEqual(['id', 'postId']);
		});

		test('should return empty array for paths without parameters', () => {
			expect(extractPathParams('/users')).toEqual([]);
			expect(extractPathParams('/api/health')).toEqual([]);
		});

		test('should handle path with only wildcard', () => {
			expect(extractPathParams('/api/*')).toEqual([]);
		});
	});

	describe('.route() sub-router mounting', () => {
		test('should discover routes from .route() sub-router mounts', async () => {
			// Create sub-router file
			const sharedCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/items', async (c) => c.json({ items: [] }));
router.post('/items', async (c) => c.json({ created: true }));

export default router;
`;
			writeFileSync(join(apiDir, 'shared.ts'), sharedCode);

			// Create main router that mounts the sub-router
			const mainCode = `
import { createRouter } from '@agentuity/runtime';
import sharedRoutes from './shared';

const router = createRouter();

router.get('/health', async (c) => c.json({ ok: true }));
router.route('/shared', sharedRoutes);

export default router;
`;
			writeFileSync(join(apiDir, 'index.ts'), mainCode);

			const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

			// Should find /api/health from direct route
			const healthRoute = routes.find((r) => r.path === '/api/health');
			expect(healthRoute).toBeDefined();

			// Should find /api/shared/items from sub-router mount
			const getItems = routes.find((r) => r.path === '/api/shared/items' && r.method === 'get');
			expect(getItems).toBeDefined();

			const postItems = routes.find(
				(r) => r.path === '/api/shared/items' && r.method === 'post'
			);
			expect(postItems).toBeDefined();
		});

		test('should discover routes from .route() with path parameters', async () => {
			// Create sub-router
			const sessionCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => c.json({ sessions: [] }));
router.get('/:id', async (c) => c.json({ session: {} }));

export default router;
`;
			writeFileSync(join(apiDir, 'sessions.ts'), sessionCode);

			// Main router mounts with path parameter prefix
			const mainCode = `
import { createRouter } from '@agentuity/runtime';
import sessionRoutes from './sessions';

const router = createRouter();

router.route('/workspaces/:wid/sessions', sessionRoutes);

export default router;
`;
			writeFileSync(join(apiDir, 'index.ts'), mainCode);

			const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

			// Should find routes with combined path parameters
			const listSessions = routes.find((r) => r.path === '/api/workspaces/:wid/sessions');
			expect(listSessions).toBeDefined();

			const getSession = routes.find((r) => r.path === '/api/workspaces/:wid/sessions/:id');
			expect(getSession).toBeDefined();
		});

		test('should gracefully skip .route() with unresolvable sub-router', async () => {
			const mainCode = `
import { createRouter } from '@agentuity/runtime';
import unknownRoutes from './nonexistent';

const router = createRouter();

router.get('/health', async (c) => c.json({ ok: true }));
router.route('/unknown', unknownRoutes);

export default router;
`;
			writeFileSync(join(apiDir, 'index.ts'), mainCode);

			const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

			// Should still find the health route even though sub-router resolution failed
			const healthRoute = routes.find((r) => r.path === '/api/health');
			expect(healthRoute).toBeDefined();
		});

		test('should discover routes from multiple .route() mounts', async () => {
			// Create sub-router files
			const usersCode = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', async (c) => c.json({ users: [] }));
router.post('/', async (c) => c.json({ created: true }));
export default router;
`;
			writeFileSync(join(apiDir, 'users-routes.ts'), usersCode);

			const postsCode = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/', async (c) => c.json({ posts: [] }));
export default router;
`;
			writeFileSync(join(apiDir, 'posts-routes.ts'), postsCode);

			const mainCode = `
import { createRouter } from '@agentuity/runtime';
import userRoutes from './users-routes';
import postRoutes from './posts-routes';

const router = createRouter();
router.route('/users', userRoutes);
router.route('/posts', postRoutes);
export default router;
`;
			writeFileSync(join(apiDir, 'index.ts'), mainCode);

			const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

			const getUsers = routes.find((r) => r.path === '/api/users' && r.method === 'get');
			expect(getUsers).toBeDefined();

			const postUsers = routes.find((r) => r.path === '/api/users' && r.method === 'post');
			expect(postUsers).toBeDefined();

			const getPosts = routes.find((r) => r.path === '/api/posts' && r.method === 'get');
			expect(getPosts).toBeDefined();
		});
	});
});
