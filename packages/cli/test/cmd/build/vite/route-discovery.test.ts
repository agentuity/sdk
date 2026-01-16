import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import {
	discoverRoutes,
	detectRouteConflicts,
	extractPathParams,
} from '../../../../src/cmd/build/vite/route-discovery';

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
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { z } from 'zod';

const router = createRouter();

router.get('/users', async (c) => {
	return c.json({ users: [] });
});

export default router;
`;
		writeFileSync(join(apiDir, 'users.ts'), routeCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		expect(routes.length).toBeGreaterThan(0);
		// parseRoute adds /api prefix to all routes
		const userRoute = routes.find((r) => r.path === '/api/users');
		expect(userRoute).toBeDefined();
		expect(userRoute!.method).toBe('get');
		expect(userRoute!.type).toBe('api');
	});

	test('should discover route with validator', async () => {
		const routeCode = `
import { createRouter, validator } from '@agentuity/runtime';
import { z } from 'zod';

const router = createRouter();

router.post(
	'/create',
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
		// parseRoute adds /api prefix to all routes
		const createRoute = routeInfoList.find((r) => r.path === '/api/create');
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
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import testAgent from '../agent/test';

const router = createRouter();

router.post('/chat', testAgent.validator(), async (c) => {
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
		// parseRoute adds /api prefix to all routes
		const chatRoute = routeInfoList.find((r) => r.path === '/api/chat');
		expect(chatRoute).toBeDefined();
		expect(chatRoute!.hasValidator).toBe(true);
		expect(chatRoute!.agentVariable).toBe('testAgent');
	});

	test('should discover multiple routes in subdirectories', async () => {
		// Create routes in subdirectory
		const usersDir = join(apiDir, 'users');
		mkdirSync(usersDir);

		const listRouteCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/list', async (c) => {
	return c.json({ users: [] });
});

export default router;
`;
		writeFileSync(join(usersDir, 'list.ts'), listRouteCode);

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
		// Create index.ts with routes
		const indexCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/index-route', async (c) => {
	return c.json({ message: 'index' });
});

export default router;
`;
		writeFileSync(join(apiDir, 'index.ts'), indexCode);

		// Create another route
		const otherCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/other', async (c) => {
	return c.json({ message: 'other' });
});

export default router;
`;
		writeFileSync(join(apiDir, 'other.ts'), otherCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Should find both /api/index-route AND /api/other
		const indexRoute = routes.find((r) => r.path === '/api/index-route');
		expect(indexRoute).toBeDefined();

		const otherRoute = routes.find((r) => r.path === '/api/other');
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
		// Create valid route
		const validCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/valid', async (c) => {
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
		const validRoute = routes.find((r) => r.path === '/api/valid');
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
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/resource', async (c) => c.json({}));
router.post('/resource', async (c) => c.json({}));
router.put('/resource', async (c) => c.json({}));
router.delete('/resource', async (c) => c.json({}));
router.patch('/resource', async (c) => c.json({}));

export default router;
`;
		writeFileSync(join(apiDir, 'resource.ts'), routeCode);

		const { routes } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// All routes should have /api/resource path with different methods
		const methods = new Set(
			routes.filter((r) => r.path === '/api/resource').map((r) => r.method)
		);
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
});
