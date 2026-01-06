import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import { discoverRoutes } from '../src/cmd/build/vite/route-discovery';
import { generateRouteRegistry } from '../src/cmd/build/vite/registry-generator';

/**
 * Integration tests for Hono validator('json', callback) schema extraction
 *
 * These tests verify that the full build pipeline correctly:
 * 1. Parses routes using the Hono validator pattern
 * 2. Extracts inputSchemaVariable from schema['~standard'].validate() or schema.validate() calls
 * 3. Generates routes.ts with proper type imports and InferInput<typeof schema> types
 */
describe('Hono validator schema extraction integration', () => {
	let testDir: string;
	let srcDir: string;
	let apiDir: string;
	let generatedDir: string;
	const logger = createMockLogger();

	beforeEach(() => {
		testDir = join(tmpdir(), `hono-validator-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		apiDir = join(srcDir, 'api');
		generatedDir = join(srcDir, 'generated');
		mkdirSync(apiDir, { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("validator('json', callback) with schema['~standard'].validate() - should extract schema and generate proper types", async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';
import { s } from '@agentuity/schema';

export const createUserSchema = s.object({
	name: s.string(),
	email: s.string(),
});

const router = createRouter();

router.post(
	'/users',
	validator('json', (value, c) => {
		const result = createUserSchema['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const data = c.req.valid('json');
		return c.json({ success: true, user: data });
	}
);

export default router;
`;
		writeFileSync(join(apiDir, 'users.ts'), routeCode);

		const { routes, routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		expect(routes.length).toBeGreaterThan(0);
		const usersRoute = routeInfoList.find((r) => r.path === '/api/users');
		expect(usersRoute).toBeDefined();
		expect(usersRoute!.hasValidator).toBe(true);
		expect(usersRoute!.inputSchemaVariable).toBe('createUserSchema');

		generateRouteRegistry(srcDir, routeInfoList);

		const routesPath = join(generatedDir, 'routes.ts');
		expect(existsSync(routesPath)).toBe(true);

		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).toContain("import type { createUserSchema as createUserSchema_0 } from '../api/users'");
		expect(routesContent).toContain('InferInput<typeof createUserSchema_0>');
		expect(routesContent).toContain('export type POSTApiUsersInput');
	});

	test("validator('json', callback) with schema.validate() - should extract schema", async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';

export const mySchema = { validate: (v: unknown) => v };

const router = createRouter();

router.post('/data', validator('json', (value, c) => {
	const result = mySchema.validate(value);
	return result;
}), async (c) => {
	return c.json({ ok: true });
});

export default router;
`;
		writeFileSync(join(apiDir, 'data.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const dataRoute = routeInfoList.find((r) => r.path === '/api/data');
		expect(dataRoute).toBeDefined();
		expect(dataRoute!.hasValidator).toBe(true);
		expect(dataRoute!.inputSchemaVariable).toBe('mySchema');

		generateRouteRegistry(srcDir, routeInfoList);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).toContain("import type { mySchema as mySchema_0 } from '../api/data'");
		expect(routesContent).toContain('InferInput<typeof mySchema_0>');
	});

	test('multiple routes with different schemas - should extract all schemas correctly', async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';
import { s } from '@agentuity/schema';

export const userSchema = s.object({ name: s.string() });
export const orderSchema = s.object({ productId: s.string(), quantity: s.number() });

const router = createRouter();

router.post('/users', validator('json', (value, c) => {
	const result = userSchema['~standard'].validate(value);
	if (result.issues) return c.json({ error: 'Invalid' }, 400);
	return result.value;
}), async (c) => c.json({ ok: true }));

router.post('/orders', validator('json', (value, c) => {
	const result = orderSchema['~standard'].validate(value);
	if (result.issues) return c.json({ error: 'Invalid' }, 400);
	return result.value;
}), async (c) => c.json({ ok: true }));

export default router;
`;
		writeFileSync(join(apiDir, 'multi.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const usersRoute = routeInfoList.find((r) => r.path === '/api/users');
		const ordersRoute = routeInfoList.find((r) => r.path === '/api/orders');

		expect(usersRoute).toBeDefined();
		expect(usersRoute!.inputSchemaVariable).toBe('userSchema');

		expect(ordersRoute).toBeDefined();
		expect(ordersRoute!.inputSchemaVariable).toBe('orderSchema');

		generateRouteRegistry(srcDir, routeInfoList);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).toContain('userSchema');
		expect(routesContent).toContain('orderSchema');
		expect(routesContent).toContain('export type POSTApiUsersInput');
		expect(routesContent).toContain('export type POSTApiOrdersInput');
	});

	test("validator('query', callback) - should NOT extract schema (only 'json' is supported)", async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';

export const querySchema = { validate: (v: unknown) => v };

const router = createRouter();

router.get('/search', validator('query', (value, c) => {
	const result = querySchema.validate(value);
	return result;
}), async (c) => {
	return c.json({ results: [] });
});

export default router;
`;
		writeFileSync(join(apiDir, 'search.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const searchRoute = routeInfoList.find((r) => r.path === '/api/search');
		expect(searchRoute).toBeDefined();
		expect(searchRoute!.hasValidator).toBe(true);
		expect(searchRoute!.inputSchemaVariable).toBeUndefined();

		generateRouteRegistry(srcDir, routeInfoList);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).not.toContain('querySchema');
	});

	test("validator('header', callback) - should NOT extract schema", async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';

export const headerSchema = { validate: (v: unknown) => v };

const router = createRouter();

router.get('/protected', validator('header', (value, c) => {
	const result = headerSchema.validate(value);
	return result;
}), async (c) => {
	return c.json({ ok: true });
});

export default router;
`;
		writeFileSync(join(apiDir, 'protected.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const protectedRoute = routeInfoList.find((r) => r.path === '/api/protected');
		expect(protectedRoute).toBeDefined();
		expect(protectedRoute!.hasValidator).toBe(true);
		expect(protectedRoute!.inputSchemaVariable).toBeUndefined();
	});

	test('route with both agent.validator() and hono validator - agent takes precedence', async () => {
		const agentDir = join(srcDir, 'agent');
		mkdirSync(agentDir);

		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent({
	metadata: { name: 'test-agent' },
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.object({ response: s.string() }),
	},
	handler: async (ctx, input) => ({ response: 'Hello' }),
});
`;
		writeFileSync(join(agentDir, 'test.ts'), agentCode);

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

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const chatRoute = routeInfoList.find((r) => r.path === '/api/chat');
		expect(chatRoute).toBeDefined();
		expect(chatRoute!.hasValidator).toBe(true);
		expect(chatRoute!.agentVariable).toBe('testAgent');
	});

	test('route without any validator - should have never types', async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/health', async (c) => {
	return c.json({ status: 'ok' });
});

export default router;
`;
		writeFileSync(join(apiDir, 'health.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const healthRoute = routeInfoList.find((r) => r.path === '/api/health');
		expect(healthRoute).toBeDefined();
		expect(healthRoute!.hasValidator).toBeFalsy();
		expect(healthRoute!.inputSchemaVariable).toBeUndefined();
		expect(healthRoute!.agentVariable).toBeUndefined();

		generateRouteRegistry(srcDir, routeInfoList);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).toContain("'GET /api/health'");
		expect(routesContent).toContain('inputSchema: never');
		expect(routesContent).toContain('outputSchema: never');
	});

	test('schema from different file import - should extract variable name', async () => {
		const schemasDir = join(srcDir, 'schemas');
		mkdirSync(schemasDir, { recursive: true });

		const schemasCode = `
import { s } from '@agentuity/schema';

export const productSchema = s.object({
	id: s.string(),
	name: s.string(),
	price: s.number(),
});
`;
		writeFileSync(join(schemasDir, 'product.ts'), schemasCode);

		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';
import { productSchema } from '../../schemas/product';

const router = createRouter();

router.post('/products', validator('json', (value, c) => {
	const result = productSchema['~standard'].validate(value);
	if (result.issues) return c.json({ error: 'Invalid' }, 400);
	return result.value;
}), async (c) => c.json({ ok: true }));

export default router;
`;
		writeFileSync(join(apiDir, 'products.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const productsRoute = routeInfoList.find((r) => r.path === '/api/products');
		expect(productsRoute).toBeDefined();
		expect(productsRoute!.hasValidator).toBe(true);
		expect(productsRoute!.inputSchemaVariable).toBe('productSchema');
	});

	test('nested validator callback with arrow function - should extract schema', async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';
import { s } from '@agentuity/schema';

export const itemSchema = s.object({ id: s.string() });

const router = createRouter();

router.post('/items', validator('json', (value, c) => {
	const validate = () => {
		return itemSchema['~standard'].validate(value);
	};
	const result = validate();
	if (result.issues) return c.json({ error: 'Invalid' }, 400);
	return result.value;
}), async (c) => c.json({ ok: true }));

export default router;
`;
		writeFileSync(join(apiDir, 'items.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const itemsRoute = routeInfoList.find((r) => r.path === '/api/items');
		expect(itemsRoute).toBeDefined();
		expect(itemsRoute!.hasValidator).toBe(true);
		expect(itemsRoute!.inputSchemaVariable).toBe('itemSchema');
	});

	test('routes with routes in subdirectories - should extract schemas from all', async () => {
		const usersApiDir = join(apiDir, 'users');
		mkdirSync(usersApiDir, { recursive: true });

		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';
import { s } from '@agentuity/schema';

export const createUserSchema = s.object({
	name: s.string(),
	email: s.string(),
});

const router = createRouter();

router.post('/create', validator('json', (value, c) => {
	const result = createUserSchema['~standard'].validate(value);
	if (result.issues) return c.json({ error: 'Invalid' }, 400);
	return result.value;
}), async (c) => c.json({ ok: true }));

export default router;
`;
		writeFileSync(join(usersApiDir, 'create.ts'), routeCode);

		const { routeInfoList } = await discoverRoutes(
			srcDir,
			'test-project',
			'test-deployment',
			logger
		);

		const createRoute = routeInfoList.find((r) => r.path?.includes('/create'));
		expect(createRoute).toBeDefined();
		expect(createRoute!.hasValidator).toBe(true);
		expect(createRoute!.inputSchemaVariable).toBe('createUserSchema');
	});
});
