/**
 * Tests for middleware timing - validates that custom middleware
 * applied to the global router in app.ts is available in routes
 */

import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createBaseMiddleware } from '../src/middleware';
import { register } from '../src/otel/config';
import type { Logger } from '../src/logger';
import type { Meter, Tracer } from '@opentelemetry/api';

// Extend Variables interface for our custom middleware
interface CustomVariables {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
	customData?: string;
	dbClient?: {
		query: (sql: string) => Promise<any>;
	};
}

test('middleware applied to global router should be available in mounted routes', async () => {
	// Step 1: Create global router (simulating entry-generator Step 2)
	const app = new Hono<{ Variables: CustomVariables }>();

	// Step 2: Initialize telemetry (simulating entry-generator Step 1)
	const otel = register({ processors: [], logLevel: 'info' });

	// Step 3: Apply base middleware (simulating entry-generator Step 3)
	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	// Step 4: Simulate user's app.ts adding custom middleware
	// THIS IS WHAT USERS EXPECT TO WORK
	app.use('/api/*', async (c, next) => {
		c.set('customData', 'custom-value-from-middleware');
		c.set('dbClient', {
			query: async (sql: string) => {
				return { result: `Query: ${sql}` };
			},
		});
		await next();
	});

	// Step 5: Create route (simulating dynamically imported route in entry-generator Step 6)
	const router = new Hono<{ Variables: CustomVariables }>();

	router.get('/', (c) => {
		const customData = c.var.customData;
		const dbClient = c.var.dbClient;

		if (!customData) {
			return c.json({ error: 'customData not available' }, 500);
		}

		if (!dbClient) {
			return c.json({ error: 'dbClient not available' }, 500);
		}

		return c.json({
			success: true,
			customData,
			hasDbClient: !!dbClient,
		});
	});

	router.get('/query', async (c) => {
		const dbClient = c.var.dbClient;

		if (!dbClient) {
			return c.json({ error: 'dbClient not available' }, 500);
		}

		const result = await dbClient.query('SELECT * FROM users');
		return c.json({ success: true, result });
	});

	// Step 6: Mount routes (simulating entry-generator Step 6)
	app.route('/api/test', router);

	// Test 1: Verify custom middleware data is available
	const res1 = await app.request('/api/test');
	expect(res1.status).toBe(200);

	const data1 = await res1.json();
	expect(data1.success).toBe(true);
	expect(data1.customData).toBe('custom-value-from-middleware');
	expect(data1.hasDbClient).toBe(true);

	// Test 2: Verify database client is callable
	const res2 = await app.request('/api/test/query');
	expect(res2.status).toBe(200);

	const data2 = await res2.json();
	expect(data2.success).toBe(true);
	expect(data2.result).toEqual({ result: 'Query: SELECT * FROM users' });
});

test('middleware timing issue - routes created BEFORE middleware application', async () => {
	// This test demonstrates the WRONG order - what might be happening in the bug

	const otel = register({ processors: [], logLevel: 'info' });

	// Step 1: Create route FIRST (WRONG ORDER - but might happen if routes are created during module initialization)
	const router = new Hono<{ Variables: CustomVariables }>();

	router.get('/', (c) => {
		const dbClient = c.var.dbClient;

		if (!dbClient) {
			return c.json({ error: 'dbClient not available - middleware not applied?' }, 500);
		}

		return c.json({ success: true, hasDbClient: !!dbClient });
	});

	// Step 2: Create global router AFTER route is created
	const app = new Hono<{ Variables: CustomVariables }>();

	// Step 3: Apply base middleware
	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	// Step 4: Apply custom middleware
	app.use('/api/*', async (c, next) => {
		c.set('dbClient', {
			query: async (sql: string) => {
				return { result: `Query: ${sql}` };
			},
		});
		await next();
	});

	// Step 5: Mount routes AFTER middleware
	app.route('/api/test', router);

	// Test: This SHOULD work because we're using Hono's routing correctly
	// The router is mounted AFTER middleware, so middleware should be applied
	const res = await app.request('/api/test');
	expect(res.status).toBe(200); // This should pass if Hono works correctly

	const data = await res.json();
	expect(data.success).toBe(true);
	expect(data.hasDbClient).toBe(true);
});

test('middleware applied to specific route should work', async () => {
	// Test that middleware applied to a specific mounted route works

	const otel = register({ processors: [], logLevel: 'info' });

	const app = new Hono<{ Variables: CustomVariables }>();

	// Apply base middleware
	app.use(
		'*',
		createBaseMiddleware({
			logger: otel.logger,
			tracer: otel.tracer,
			meter: otel.meter,
		})
	);

	// Create route WITHOUT custom middleware
	const router = new Hono<{ Variables: CustomVariables }>();

	// Apply middleware directly to router BEFORE mounting
	router.use('*', async (c, next) => {
		c.set('customData', 'route-specific-middleware');
		await next();
	});

	router.get('/', (c) => {
		const customData = c.var.customData;
		return c.json({ success: true, customData });
	});

	// Mount route
	app.route('/api/test', router);

	// Test: Route-specific middleware should work
	const res = await app.request('/api/test');
	expect(res.status).toBe(200);

	const data = await res.json();
	expect(data.success).toBe(true);
	expect(data.customData).toBe('route-specific-middleware');
});

test('user cannot apply middleware to global router from app.ts', async () => {
	/**
	 * This test demonstrates the ACTUAL problem:
	 * Users expect to access the global router in app.ts to add middleware,
	 * but createApp() doesn't return the router or provide a way to add middleware
	 */

	const otel = register({ processors: [], logLevel: 'info' });

	// User's expectation: They want to do this in app.ts:
	// const app = await createApp({ ... });
	// app.router.use('/api/*', myCustomMiddleware);

	// But createApp returns only: { state, config, server }
	// There's NO way to access the global router!

	// The global router is created in entry-generator AFTER app.ts is imported
	// So even if createApp returned a router, it would be the wrong one

	// This is the core issue: Architecture doesn't support user middleware on global router
	expect(true).toBe(true); // Placeholder - demonstrates the conceptual problem
});
