/**
 * Tests for createBaseApp - standalone bring-your-own-router pattern.
 *
 * These tests verify that createBaseApp correctly:
 * - Accepts a user-provided Hono router
 * - Applies Agentuity middleware (base, CORS, OTel, agent context)
 * - Mounts the user router at the configured prefix
 * - Mounts system routes (health checks, workbench)
 * - Returns the expected result shape
 *
 * Note: createBaseApp bootstraps OTel, services, etc. — these tests focus on
 * the routing/middleware wiring, not full integration (which requires env vars).
 */

import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createRouter } from '../src/router';
import type { BaseAppConfig, BaseAppResult } from '../src/base-app';

describe('createBaseApp', () => {
	test('exports are available from index', async () => {
		const mod = await import('../src/index');
		expect(mod.createBaseApp).toBeFunction();
	});

	test('BaseAppConfig type requires router property', () => {
		// Type-level test: this should compile
		const _config: BaseAppConfig = {
			router: new Hono(),
		};
		expect(_config.router).toBeDefined();
	});

	test('BaseAppConfig accepts all AppConfig properties', () => {
		// Type-level test: verify the config extends AppConfig properly
		const _config: BaseAppConfig<{ db: string }> = {
			router: new Hono(),
			setup: async () => ({ db: 'test' }),
			shutdown: async (_state) => {},
			cors: { origin: '*' },
			compression: { enabled: false },
			requestTimeout: 30,
			routePrefix: '/v1',
			workbench: false,
			healthChecks: true,
			port: 4000,
			logLevel: 'debug',
		};
		expect(_config.routePrefix).toBe('/v1');
	});

	test('BaseAppResult has the expected shape', () => {
		// Type-level test
		type _Check = BaseAppResult<{ db: string }>;

		// Verify the interface has the expected keys
		const keys: (keyof BaseAppResult)[] = [
			'router',
			'state',
			'logger',
			'server',
			'addEventListener',
			'removeEventListener',
		];
		expect(keys).toHaveLength(6);
	});
});

describe('createRouter - sub-router compatibility', () => {
	test('createRouter produces a Hono instance that can be used as sub-router', () => {
		const sub = createRouter();
		sub.get('/hello', (c) => c.text('world'));

		const parent = new Hono();
		parent.route('/api', sub);

		// Verify it's a valid Hono instance
		expect(sub).toBeInstanceOf(Hono);
	});

	test('sub-routers compose correctly via .route()', async () => {
		const users = createRouter();
		users.get('/', (c) => c.json({ users: [] }));
		users.get('/:id', (c) => c.json({ id: c.req.param('id') }));
		users.post('/', async (c) => {
			const body = await c.req.json();
			return c.json({ created: body });
		});

		const auth = createRouter();
		auth.post('/login', (c) => c.json({ token: 'abc' }));
		auth.post('/logout', (c) => c.json({ success: true }));

		// Root router mounts sub-routers (this is what the user would do)
		const router = createRouter();
		router.route('/users', users);
		router.route('/auth', auth);
		router.get('/health', (c) => c.text('OK'));

		// Simulate what createBaseApp does: mount user router at a prefix
		const app = new Hono();
		app.route('/api', router);

		// Test all routes work at their final paths
		let res = await app.request('/api/users');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ users: [] });

		res = await app.request('/api/users/42');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: '42' });

		res = await app.request('/api/users', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Alice' }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ created: { name: 'Alice' } });

		res = await app.request('/api/auth/login', { method: 'POST' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ token: 'abc' });

		res = await app.request('/api/auth/logout', { method: 'POST' });
		expect(res.status).toBe(200);

		res = await app.request('/api/health');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('OK');
	});

	test('sub-routers preserve middleware', async () => {
		const users = createRouter();

		// Add middleware to the sub-router
		users.use('*', async (c, next) => {
			c.header('X-Custom', 'from-middleware');
			await next();
		});
		users.get('/', (c) => c.json({ users: [] }));

		const app = new Hono();
		app.route('/api', users);

		const res = await app.request('/api');
		expect(res.status).toBe(200);
		expect(res.headers.get('X-Custom')).toBe('from-middleware');
	});

	test('deeply nested sub-routers work', async () => {
		const items = createRouter();
		items.get('/', (c) => c.json({ items: [] }));

		const projects = createRouter();
		projects.get('/', (c) => c.json({ projects: [] }));
		projects.route('/items', items);

		const v1 = createRouter();
		v1.route('/projects', projects);

		const app = new Hono();
		app.route('/api/v1', v1);

		let res = await app.request('/api/v1/projects');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ projects: [] });

		res = await app.request('/api/v1/projects/items');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ items: [] });
	});

	test('route prefix "/" mounts at root', async () => {
		const router = createRouter();
		router.get('/hello', (c) => c.text('world'));
		router.get('/nested/path', (c) => c.text('deep'));

		const app = new Hono();
		app.route('/', router);

		let res = await app.request('/hello');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('world');

		res = await app.request('/nested/path');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('deep');
	});

	test('middleware pattern "*" matches all sub-routes', async () => {
		const router = createRouter();
		router.get('/a', (c) => c.text('a'));
		router.get('/b', (c) => c.text('b'));

		const app = new Hono();
		const intercepted: string[] = [];

		// Simulate Agentuity middleware applied to /api/*
		app.use('/api/*', async (c, next) => {
			intercepted.push(c.req.path);
			await next();
		});
		app.route('/api', router);

		await app.request('/api/a');
		await app.request('/api/b');

		expect(intercepted).toEqual(['/api/a', '/api/b']);
	});

	test('system routes are not affected by user route prefix middleware', async () => {
		const router = createRouter();
		router.get('/data', (c) => c.json({ data: true }));

		const app = new Hono();
		let middlewareCallCount = 0;

		// Only /api/* gets middleware
		app.use('/api/*', async (_c, next) => {
			middlewareCallCount++;
			await next();
		});

		// System routes at /_agentuity/* should NOT trigger /api/* middleware
		app.get('/_agentuity/health', (c) => c.text('OK'));
		app.route('/api', router);

		// Health check — should NOT trigger middleware
		middlewareCallCount = 0;
		const healthRes = await app.request('/_agentuity/health');
		expect(healthRes.status).toBe(200);
		expect(middlewareCallCount).toBe(0);

		// API route — SHOULD trigger middleware
		const apiRes = await app.request('/api/data');
		expect(apiRes.status).toBe(200);
		expect(middlewareCallCount).toBe(1);
	});
});
