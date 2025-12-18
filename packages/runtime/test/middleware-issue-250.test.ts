/**
 * Test for GitHub Issue #250 - Middleware not being applied
 * 
 * This demonstrates the EXACT problem from ops-center:
 * User is creating middleware in a route file instead of app.ts
 */

import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createRouter } from '../src/router';
import { createBaseMiddleware } from '../src/middleware';
import { register } from '../src/otel/config';
import { setGlobalRouter } from '../src/_server';
import type { Logger } from '../src/logger';
import type { Meter, Tracer } from '@opentelemetry/api';

interface CustomVariables {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
	clickhouseClient?: { query: (sql: string) => Promise<any> };
	postgresClient?: { query: (sql: string) => Promise<any> };
}

test('WRONG: middleware in route file - demonstrates the bug', async () => {
	/**
	 * This is what the user is doing in ops-center (WRONG):
	 * 
	 * In src/api/index.ts:
	 *   const api = createRouter();
	 *   api.use('*', clickhouseMiddleware());
	 *   api.use('*', postgresMiddleware());
	 *   export default api;
	 * 
	 * The problem: This middleware is only applied to THIS router,
	 * not to other route files like deployments/route.ts
	 */

	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(app as any);

	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter,
	}));

	// === src/api/index.ts (what user did - WRONG) ===
	const apiRouter = createRouter<{ Variables: CustomVariables }>();

	// User adds middleware to THEIR router (not the global app router)
	apiRouter.use('*', async (c, next) => {
		c.set('clickhouseClient', {
			query: async (sql: string) => ({ rows: [{ id: 1 }] }),
		});
		await next();
	});

	apiRouter.use('*', async (c, next) => {
		c.set('postgresClient', {
			query: async (sql: string) => ({ rows: [{ id: 2 }] }),
		});
		await next();
	});

	apiRouter.get('/', (c) => {
		// This route works because it's on the SAME router that has the middleware
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
			hasPostgres: !!c.var.postgresClient,
		});
	});

	app.route('/api', apiRouter);

	// === src/api/deployments/route.ts (separate route file) ===
	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();

	deploymentsRouter.get('/', (c) => {
		// THIS FAILS - middleware not available because it's on a different router!
		const clickhouse = c.var.clickhouseClient;
		const postgres = c.var.postgresClient;

		return c.json({
			hasClickhouse: !!clickhouse,
			hasPostgres: !!postgres,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	// Test 1: Routes on the SAME router work
	const res1 = await app.request('/api');
	const data1 = await res1.json();
	expect(data1.hasClickhouse).toBe(true);
	expect(data1.hasPostgres).toBe(true);

	// Test 2: Routes on DIFFERENT routers DON'T work (THIS IS THE BUG)
	const res2 = await app.request('/api/deployments');
	const data2 = await res2.json();
	expect(data2.hasClickhouse).toBe(false); // ❌ Middleware not applied!
	expect(data2.hasPostgres).toBe(false);   // ❌ Middleware not applied!
});

test('CORRECT: middleware in app.ts - how it should be done', async () => {
	/**
	 * This is the CORRECT way to add middleware:
	 * 
	 * In app.ts:
	 *   const app = await createApp({ ... });
	 *   app.router.use('/api/*', clickhouseMiddleware());
	 *   app.router.use('/api/*', postgresMiddleware());
	 * 
	 * Then all routes under /api/* will have access to the middleware
	 */

	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(app as any);

	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter,
	}));

	// === app.ts (CORRECT way) ===
	// Add middleware to the GLOBAL app router
	app.use('/api/*', async (c, next) => {
		c.set('clickhouseClient', {
			query: async (sql: string) => ({ rows: [{ id: 1 }] }),
		});
		await next();
	});

	app.use('/api/*', async (c, next) => {
		c.set('postgresClient', {
			query: async (sql: string) => ({ rows: [{ id: 2 }] }),
		});
		await next();
	});

	// === src/api/index.ts (route file - NO middleware here) ===
	const apiRouter = createRouter<{ Variables: CustomVariables }>();

	apiRouter.get('/', (c) => {
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
			hasPostgres: !!c.var.postgresClient,
		});
	});

	app.route('/api', apiRouter);

	// === src/api/deployments/route.ts (separate route file) ===
	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();

	deploymentsRouter.get('/', (c) => {
		// Now middleware IS available!
		const clickhouse = c.var.clickhouseClient;
		const postgres = c.var.postgresClient;

		return c.json({
			hasClickhouse: !!clickhouse,
			hasPostgres: !!postgres,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	// Test 1: Routes work
	const res1 = await app.request('/api');
	const data1 = await res1.json();
	expect(data1.hasClickhouse).toBe(true);
	expect(data1.hasPostgres).toBe(true);

	// Test 2: ALL routes now have middleware (FIXED)
	const res2 = await app.request('/api/deployments');
	const data2 = await res2.json();
	expect(data2.hasClickhouse).toBe(true); // ✅ Works!
	expect(data2.hasPostgres).toBe(true);   // ✅ Works!
});

test('demonstrating the exact ops-center scenario', async () => {
	/**
	 * Exact scenario:
	 * - api/index.ts has middleware
	 * - api/deployments/route.ts doesn't
	 * - Deployments route can't access middleware
	 */

	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(app as any);

	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter,
	}));

	// Problem: api/index.ts creates router and adds middleware
	const apiIndexRouter = createRouter<{ Variables: CustomVariables }>();
	
	apiIndexRouter.use('*', async (c, next) => {
		c.set('clickhouseClient', {
			query: async (sql: string) => ({ clickhouse: true }),
		});
		await next();
	});

	// This route works because it's on the same router
	apiIndexRouter.get('/health', (c) => {
		return c.json({ hasClient: !!c.var.clickhouseClient });
	});

	// Mount api/index.ts router
	app.route('/api', apiIndexRouter);

	// Separate file: api/deployments/route.ts
	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();
	
	deploymentsRouter.get('/', (c) => {
		const client = c.var.clickhouseClient;
		
		if (!client) {
			return c.json({ error: 'No database client - middleware not applied!' }, 500);
		}
		
		return c.json({ success: true });
	});

	// Mount deployments separately (this is the issue!)
	app.route('/api/deployments', deploymentsRouter);

	// /api/health works (same router as middleware)
	const res1 = await app.request('/api/health');
	expect(res1.status).toBe(200);
	const data1 = await res1.json();
	expect(data1.hasClient).toBe(true);

	// /api/deployments FAILS (different router)
	const res2 = await app.request('/api/deployments');
	expect(res2.status).toBe(500);
	const data2 = await res2.json();
	expect(data2.error).toBe('No database client - middleware not applied!');
});
