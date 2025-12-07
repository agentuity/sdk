import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { parseRoute } from '../src/cmd/build/ast';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = '/tmp/agentuity-cli-test-subdirectory-routes';

describe('Route Subdirectory Discovery', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test('should parse route.ts in subdirectory', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'auth');
		mkdirSync(apiDir, { recursive: true });
		const routeFile = join(apiDir, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.post('/login', (c) => c.json({ success: true }));
router.post('/logout', (c) => c.json({ success: true }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(2);
		expect(routes[0].method).toBe('post');
		// Routes in subdirectories are prefixed with /api/{folder}
		expect(routes[0].path).toBe('/api/auth/login');
		expect(routes[1].path).toBe('/api/auth/logout');
	});

	test('should parse route.ts with TypeScript interfaces', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'users');
		mkdirSync(apiDir, { recursive: true });
		const routeFile = join(apiDir, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';

interface User {
	id: string;
	name: string;
	email: string;
}

interface CreateUserRequest {
	name: string;
	email: string;
}

const router = createRouter();

router.get('/:id', (c) => {
	const user: User = { id: '1', name: 'Test', email: 'test@example.com' };
	return c.json(user);
});

router.post('/', (c) => {
	const body: CreateUserRequest = { name: 'New', email: 'new@example.com' };
	return c.json({ id: '123' });
});

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(2);
		expect(routes[0].method).toBe('get');
		// Routes are auto-prefixed with /api/{folder}
		expect(routes[0].path).toBe('/api/users/:id');
		expect(routes[1].method).toBe('post');
		expect(routes[1].path).toBe('/api/users');
	});

	test('should parse route.ts with TypeScript type annotations', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'products');
		mkdirSync(apiDir, { recursive: true });
		const routeFile = join(apiDir, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
import type { Context } from 'hono';

type Product = {
	id: string;
	name: string;
	price: number;
};

const router = createRouter();

router.get('/', (c: Context) => {
	const products: Product[] = [
		{ id: '1', name: 'Widget', price: 9.99 }
	];
	return c.json(products);
});

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');
	});

	test('should parse nested route.ts files', async () => {
		const nestedDir = join(TEST_DIR, 'src', 'api', 'v1', 'admin', 'users');
		mkdirSync(nestedDir, { recursive: true });
		const routeFile = join(nestedDir, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.get('/', (c) => c.json({ users: [] }));
router.delete('/:id', (c) => c.json({ deleted: true }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(2);
		expect(routes[0].method).toBe('get');
		expect(routes[1].method).toBe('delete');
	});

	test('should parse non-route.ts files in subdirectories', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'auth');
		mkdirSync(apiDir, { recursive: true });
		const loginFile = join(apiDir, 'login.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router.post('/login', (c) => c.json({ token: 'abc123' }));

export default router;
		`;
		writeFileSync(loginFile, code);

		const routes = await parseRoute(TEST_DIR, loginFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		// Non-route.ts files still get folder prefix
		expect(routes[0].path).toBe('/api/auth/login');
	});

	test('should handle utility files that do not export routers', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'auth');
		mkdirSync(apiDir, { recursive: true });
		const utilFile = join(apiDir, 'utils.ts');

		const code = `
export function hashPassword(password: string): string {
	return 'hashed';
}

export function verifyPassword(password: string, hash: string): boolean {
	return true;
}
		`;
		writeFileSync(utilFile, code);

		await expect(parseRoute(TEST_DIR, utilFile, 'proj_1', 'dep_1')).rejects.toThrow();
	});

	test('should parse route.ts with enums and complex types', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'orders');
		mkdirSync(apiDir, { recursive: true });
		const routeFile = join(apiDir, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';

enum OrderStatus {
	Pending = 'pending',
	Shipped = 'shipped',
	Delivered = 'delivered'
}

type Order = {
	id: string;
	status: OrderStatus;
	items: Array<{ productId: string; quantity: number }>;
};

const router = createRouter();

router.get('/:id', (c) => {
	const order: Order = {
		id: '123',
		status: OrderStatus.Pending,
		items: []
	};
	return c.json(order);
});

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');
		// Folder name is used as prefix
		expect(routes[0].path).toBe('/api/orders/:id');
	});

	test('should parse route with generics and advanced TypeScript', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'data');
		mkdirSync(apiDir, { recursive: true });
		const routeFile = join(apiDir, 'route.ts');

		const code = `
import { createRouter } from '@agentuity/runtime';

interface ApiResponse<T> {
	data: T;
	meta: {
		timestamp: number;
	};
}

type Paginated<T> = {
	items: T[];
	total: number;
	page: number;
};

const router = createRouter();

router.get('/', (c) => {
	const response: ApiResponse<Paginated<string>> = {
		data: { items: [], total: 0, page: 1 },
		meta: { timestamp: Date.now() }
	};
	return c.json(response);
});

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');
	});

	test('should parse route.ts using new Hono() instead of createRouter()', async () => {
		const apiDir = join(TEST_DIR, 'src', 'api', 'legacy');
		mkdirSync(apiDir, { recursive: true });
		const routeFile = join(apiDir, 'route.ts');

		const code = `
import { Hono } from 'hono';

const router = new Hono();

router.get('/status', (c) => c.json({ status: 'ok' }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');
		// Legacy route gets folder prefix
		expect(routes[0].path).toBe('/api/legacy/status');
	});
});
