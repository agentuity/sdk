/**
 * Tests for sub-router composition with createRouter and the
 * createApp({ router }) user-provided router feature.
 *
 * These tests verify that createRouter-based sub-routers compose correctly
 * when mounted via Hono's .route() — the same pattern used by the CLI's
 * generated entry file and the route consolidation migration.
 */

import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createRouter } from '../src/router';
import type { AppConfig, RouteMount } from '../src/app';
import { normalizeRouterConfig } from '../src/app';

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

		// Simulate what the entry generator does: mount user router at a prefix
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

describe('createApp({ router }) - user-provided router', () => {
	test('AppConfig accepts a plain Hono router (mounted at /api)', () => {
		const router = createRouter();
		const _config: AppConfig = { router };
		expect(_config.router).toBeDefined();
	});

	test('AppConfig accepts a RouteMount object with custom path', () => {
		const router = createRouter();
		const _config: AppConfig = {
			router: { path: '/v1', router },
		};
		expect(_config.router).toBeDefined();
	});

	test('AppConfig accepts an array of RouteMount objects', () => {
		const _config: AppConfig = {
			router: [
				{ path: '/api/v1', router: createRouter() },
				{ path: '/api/v2', router: createRouter() },
			],
		};
		expect(Array.isArray(_config.router)).toBe(true);
	});

	test('AppConfig router is optional — omitting it uses file-based routing', () => {
		const _config: AppConfig = {};
		expect(_config.router).toBeUndefined();
	});

	test('normalizeRouterConfig wraps plain Hono at /api', () => {
		const router = createRouter();
		const result = normalizeRouterConfig(router);
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('/api');
		expect(result[0].router).toBe(router);
	});

	test('normalizeRouterConfig passes through RouteMount object', () => {
		const router = createRouter();
		const result = normalizeRouterConfig({ path: '/v1', router });
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('/v1');
		expect(result[0].router).toBe(router);
	});

	test('normalizeRouterConfig passes through RouteMount array', () => {
		const r1 = createRouter();
		const r2 = createRouter();
		const result = normalizeRouterConfig([
			{ path: '/api/v1', router: r1 },
			{ path: '/api/v2', router: r2 },
		]);
		expect(result).toHaveLength(2);
		expect(result[0].path).toBe('/api/v1');
		expect(result[1].path).toBe('/api/v2');
	});

	test('plain router mounts at /api by entry file', async () => {
		const userRouter = createRouter();
		userRouter.get('/health', (c) => c.text('OK'));
		userRouter.get('/users', (c) => c.json({ users: [] }));

		// Simulate entry file: iterate RouteMount[], mount each
		const mounts: RouteMount[] = [{ path: '/api', router: userRouter }];
		const app = new Hono();
		for (const mount of mounts) {
			app.route(mount.path, mount.router);
		}

		let res = await app.request('/api/health');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('OK');

		res = await app.request('/api/users');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ users: [] });
	});

	test('multiple routers mount at different prefixes', async () => {
		const v1 = createRouter();
		v1.get('/users', (c) => c.json({ version: 1, users: [] }));

		const v2 = createRouter();
		v2.get('/users', (c) => c.json({ version: 2, users: [] }));

		// Simulate entry file with array of mounts
		const mounts: RouteMount[] = [
			{ path: '/api/v1', router: v1 },
			{ path: '/api/v2', router: v2 },
		];
		const app = new Hono();
		for (const mount of mounts) {
			app.route(mount.path, mount.router);
		}

		let res = await app.request('/api/v1/users');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ version: 1, users: [] });

		res = await app.request('/api/v2/users');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ version: 2, users: [] });
	});

	test('middleware is applied per mount prefix', async () => {
		const v1 = createRouter();
		v1.get('/data', (c) => c.text('v1'));

		const v2 = createRouter();
		v2.get('/data', (c) => c.text('v2'));

		const mounts: RouteMount[] = [
			{ path: '/api/v1', router: v1 },
			{ path: '/api/v2', router: v2 },
		];

		const app = new Hono();
		const intercepted: string[] = [];

		// Simulate entry file: apply middleware to each prefix
		for (const mount of mounts) {
			const prefix = `${mount.path}/*`;
			app.use(prefix, async (c, next) => {
				intercepted.push(c.req.path);
				await next();
			});
			app.route(mount.path, mount.router);
		}

		// System route — no middleware
		app.get('/_agentuity/health', (c) => c.text('OK'));

		await app.request('/_agentuity/health');
		expect(intercepted).toHaveLength(0);

		await app.request('/api/v1/data');
		expect(intercepted).toEqual(['/api/v1/data']);

		await app.request('/api/v2/data');
		expect(intercepted).toEqual(['/api/v1/data', '/api/v2/data']);
	});
});
