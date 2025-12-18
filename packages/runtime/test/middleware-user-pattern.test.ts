/**
 * Tests for user middleware pattern - simulates how users would add middleware
 * in their app.ts file and validates it works correctly with routes
 */

import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createBaseMiddleware } from '../src/middleware';
import { register } from '../src/otel/config';
import type { Logger } from '../src/logger';
import type { Meter, Tracer } from '@opentelemetry/api';
import { setGlobalRouter, getRouter } from '../src/_server';

// Extend Variables interface for custom middleware
interface CustomVariables {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
	dbClient?: {
		query: (sql: string) => Promise<any>;
	};
}

test('user can add middleware to router returned from createApp (expected pattern)', async () => {
	/**
	 * This test simulates the EXPECTED user pattern from the ops-center issue:
	 *
	 * In app.ts:
	 *   const app = await createApp({ setup: ... });
	 *   app.router.use('/api/*', myCustomMiddleware);  // Add middleware here
	 *
	 * The question is: Will this middleware be available in routes that are
	 * mounted LATER in the entry-generator?
	 */

	const otel = register({ processors: [], logLevel: 'info' });

	// Step 1: Create global router (entry-generator does this)
	const globalRouter = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(globalRouter as any);

	// Step 2: Apply base middleware (entry-generator does this)
	globalRouter.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	// Step 3: Simulate user's app.ts
	// createApp() would be called here and return the router
	const router = getRouter() as Hono<{ Variables: CustomVariables }>;

	if (!router) {
		throw new Error('Router not available');
	}

	// User adds custom middleware to the router
	router.use('/api/*', async (c, next) => {
		c.set('dbClient', {
			query: async (sql: string) => {
				return { result: `Executed: ${sql}` };
			},
		});
		await next();
	});

	// Step 4: Simulate route file (created and mounted AFTER app.ts)
	const apiRouter = new Hono<{ Variables: CustomVariables }>();

	apiRouter.get('/deployments', async (c) => {
		// This is what the user in ops-center is trying to do
		const dbClient = c.var.dbClient;

		if (!dbClient) {
			return c.json({ error: 'dbClient not found - middleware not applied!' }, 500);
		}

		const result = await dbClient.query('SELECT * FROM deployments');
		return c.json({ success: true, data: result });
	});

	// Step 5: Mount the route (entry-generator does this)
	router.route('/api', apiRouter);

	// Test: Verify middleware is available in the route
	const res = await router.request('/api/deployments');
	expect(res.status).toBe(200);

	const data = await res.json();
	expect(data.success).toBe(true);
	expect(data.data).toEqual({ result: 'Executed: SELECT * FROM deployments' });
});

test('middleware timing with actual entry-generator order', async () => {
	/**
	 * This test follows the EXACT order from entry-generator.ts:
	 * 1. Create router
	 * 2. Apply SDK middleware
	 * 3. Import app.ts (user adds middleware here)
	 * 4. Mount routes
	 */

	const otel = register({ processors: [], logLevel: 'info' });

	// === entry-generator.ts line 409-410 ===
	const app = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(app as any);

	// === entry-generator.ts line 413-427 ===
	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	app.use('/api/*', async (c, next) => {
		// SDK's OTEL middleware would go here
		await next();
	});

	// === entry-generator.ts line 430: await import('../../app.js') ===
	// Simulate user's app.ts
	const userApp = getRouter() as Hono<{ Variables: CustomVariables }>;

	// User adds their custom middleware
	userApp.use('/api/*', async (c, next) => {
		c.set('dbClient', {
			query: async (sql: string) => {
				return { rows: [{ id: 1, sql }] };
			},
		});
		await next();
	});

	// === entry-generator.ts line 439-446: Mount routes ===
	// Simulate dynamically importing and mounting routes
	const deploymentRouter = new Hono<{ Variables: CustomVariables }>();

	deploymentRouter.get('/', async (c) => {
		const dbClient = c.var.dbClient;

		if (!dbClient) {
			return c.json({ error: 'No dbClient - middleware missing!' }, 500);
		}

		const result = await dbClient.query('SELECT * FROM deployments');
		return c.json({ success: true, deployments: result.rows });
	});

	app.route('/api/deployments', deploymentRouter);

	// Test: This SHOULD work because middleware is applied before routes are mounted
	const res = await app.request('/api/deployments');
	expect(res.status).toBe(200);

	const data = await res.json();
	expect(data.success).toBe(true);
	expect(data.deployments).toHaveLength(1);
	expect(data.deployments[0].sql).toBe('SELECT * FROM deployments');
});

test('problematic case - route file directly calls app router before mounting', async () => {
	/**
	 * This test explores if the issue is that route files are trying to access
	 * the router during their MODULE INITIALIZATION instead of during request handling
	 */

	const otel = register({ processors: [], logLevel: 'info' });

	const app = new Hono<{ Variables: CustomVariables }>();
	setGlobalRouter(app as any);

	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	// Simulate a route file that tries to access middleware during module init
	// THIS WOULD BE WRONG - but might be what's happening?
	let middlewareAvailableDuringInit = false;

	const problemRouter = new Hono<{ Variables: CustomVariables }>();

	// This code runs during module initialization (when the route file is imported)
	// At this time, the middleware hasn't been applied yet
	try {
		// This would fail because middleware hasn't run yet
		// But route files don't execute request handlers during import
		middlewareAvailableDuringInit = false;
	} catch {
		middlewareAvailableDuringInit = false;
	}

	// Add custom middleware AFTER route creation (but BEFORE mounting)
	app.use('/api/*', async (c, next) => {
		c.set('dbClient', {
			query: async () => ({ success: true }),
		});
		await next();
	});

	problemRouter.get('/', (c) => {
		const dbClient = c.var.dbClient;
		return c.json({ hasDbClient: !!dbClient });
	});

	app.route('/api/test', problemRouter);

	// The middleware should be available during REQUEST handling, not during MODULE init
	const res = await app.request('/api/test');
	expect(res.status).toBe(200);

	const data = await res.json();
	expect(data.hasDbClient).toBe(true);
	expect(middlewareAvailableDuringInit).toBe(false); // Middleware not available at module init time
});
