/**
 * GitHub Issue #250 - Root Cause Test
 * 
 * PROBLEM: User added middleware to src/api/index.ts router,
 * but src/api/deployments/route.ts is mounted as a SIBLING, not a child.
 * 
 * SOLUTION: Move middleware to app.ts to apply to global router.
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
	clerkAuth?: any;
	clickhouseClient?: { query: (sql: string) => Promise<any> };
	postgresClient?: { query: (sql: string) => Promise<any> };
}

test('ACTUAL ISSUE: routes mounted as siblings, not parent-child', async () => {
	/**
	 * This is what the entry-generator does:
	 * 
	 * app.route('/api', router_0);              // src/api/index.ts
	 * app.route('/api/deployments', router_1);  // src/api/deployments/route.ts
	 * 
	 * These are SIBLINGS, both mounted directly on app.
	 * Middleware on router_0 does NOT apply to router_1!
	 */

	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(app as any);

	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter,
	}));

	// === src/api/index.ts (user's code) ===
	const apiIndexRouter = createRouter<{ Variables: CustomVariables }>();

	apiIndexRouter.use('*', async (c, next) => {
		c.set('clerkAuth', { userId: 'user-123' });
		await next();
	});

	apiIndexRouter.use('*', async (c, next) => {
		c.set('clickhouseClient', {
			query: async (sql) => ({ rows: [] }),
		});
		await next();
	});

	apiIndexRouter.use('*', async (c, next) => {
		c.set('postgresClient', {
			query: async (sql) => ({ rows: [] }),
		});
		await next();
	});

	apiIndexRouter.get('/health', (c) => {
		// This works because it's on the same router
		return c.json({
			hasClerk: !!c.var.clerkAuth,
			hasClickhouse: !!c.var.clickhouseClient,
			hasPostgres: !!c.var.postgresClient,
		});
	});

	// === entry-generator mounts index.ts at /api ===
	app.route('/api', apiIndexRouter);

	// === src/api/deployments/route.ts (separate file) ===
	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();

	deploymentsRouter.get('/', async (c) => {
		const clickhouse = c.var.clickhouseClient;
		const postgres = c.var.postgresClient;

		if (!clickhouse) {
			return c.json({ error: 'No database client - middleware not applied!' }, 500);
		}

		// Try to query
		const data = await clickhouse.query('SELECT * FROM deployments');
		return c.json({ success: true, deployments: data.rows });
	});

	// === entry-generator mounts deployments/route.ts at /api/deployments ===
	app.route('/api/deployments', deploymentsRouter);

	// Test 1: /api/health works (same router)
	const res1 = await app.request('/api/health');
	expect(res1.status).toBe(200);
	const data1 = await res1.json();
	expect(data1.hasClerk).toBe(true);
	expect(data1.hasClickhouse).toBe(true);
	expect(data1.hasPostgres).toBe(true);

	// Test 2: /api/deployments FAILS (sibling router - middleware not shared)
	const res2 = await app.request('/api/deployments');
	expect(res2.status).toBe(500);
	const data2 = await res2.json();
	expect(data2.error).toBe('No database client - middleware not applied!');
});

test('SOLUTION: Move middleware to app.ts', async () => {
	/**
	 * Correct pattern: Add middleware to the GLOBAL app router in app.ts
	 * before routes are mounted by entry-generator
	 */

	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(app as any);

	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter,
	}));

	// === app.ts (USER'S CODE - CORRECT LOCATION) ===
	// Add middleware to GLOBAL router that will apply to ALL /api/* routes
	app.use('/api/*', async (c, next) => {
		c.set('clerkAuth', { userId: 'user-123' });
		await next();
	});

	app.use('/api/*', async (c, next) => {
		c.set('clickhouseClient', {
			query: async (sql) => ({ rows: [{ id: 1 }] }),
		});
		await next();
	});

	app.use('/api/*', async (c, next) => {
		c.set('postgresClient', {
			query: async (sql) => ({ rows: [{ id: 2 }] }),
		});
		await next();
	});

	// === src/api/index.ts (NO MIDDLEWARE HERE) ===
	const apiIndexRouter = createRouter<{ Variables: CustomVariables }>();

	apiIndexRouter.get('/health', (c) => {
		return c.json({
			hasClerk: !!c.var.clerkAuth,
			hasClickhouse: !!c.var.clickhouseClient,
			hasPostgres: !!c.var.postgresClient,
		});
	});

	app.route('/api', apiIndexRouter);

	// === src/api/deployments/route.ts ===
	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();

	deploymentsRouter.get('/', async (c) => {
		const clickhouse = c.var.clickhouseClient;
		const postgres = c.var.postgresClient;

		if (!clickhouse || !postgres) {
			return c.json({ error: 'Missing clients' }, 500);
		}

		const data = await clickhouse.query('SELECT * FROM deployments');
		return c.json({ success: true, deployments: data.rows });
	});

	app.route('/api/deployments', deploymentsRouter);

	// Test 1: /api/health works
	const res1 = await app.request('/api/health');
	expect(res1.status).toBe(200);
	const data1 = await res1.json();
	expect(data1.hasClerk).toBe(true);
	expect(data1.hasClickhouse).toBe(true);
	expect(data1.hasPostgres).toBe(true);

	// Test 2: /api/deployments NOW WORKS ✅
	const res2 = await app.request('/api/deployments');
	expect(res2.status).toBe(200);
	const data2 = await res2.json();
	expect(data2.success).toBe(true);
	expect(data2.deployments).toHaveLength(1);
});

test('understanding the mount structure', () => {
	/**
	 * Entry-generator creates this structure:
	 * 
	 * app (global router)
	 *  ├── /api → router from src/api/index.ts
	 *  └── /api/deployments → router from src/api/deployments/route.ts
	 * 
	 * NOT this structure:
	 * 
	 * app (global router)
	 *  └── /api → router from src/api/index.ts
	 *       └── /deployments → router from src/api/deployments/route.ts
	 * 
	 * That's why middleware on index.ts doesn't apply to deployments/route.ts
	 */
	
	expect(true).toBe(true);
});
