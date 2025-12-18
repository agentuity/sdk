/**
 * Test for path matching issues with middleware
 * Maybe the issue is that middleware path doesn't match the route mount path
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
	meter: Tracer;
	tracer: Tracer;
	dbClient?: { query: (sql: string) => Promise<any> };
}

test('middleware with wildcard on root router applies to sub-routers', async () => {
	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	
	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter as any,
	}));

	// User creates a router and adds middleware with '*'
	const apiRouter = createRouter<{ Variables: CustomVariables }>();
	
	apiRouter.use('*', async (c, next) => {
		c.set('dbClient', {
			query: async () => ({ success: true }),
		});
		await next();
	});

	// Mount at /api
	app.route('/api', apiRouter);

	// Create separate deployments router
	const deployRouter = createRouter<{ Variables: CustomVariables }>();
	
	deployRouter.get('/', (c) => {
		return c.json({ hasClient: !!c.var.dbClient });
	});

	// Mount deployments at /api/deployments
	app.route('/api/deployments', deployRouter);

	// Test: Does wildcard middleware from apiRouter apply to deployRouter?
	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	// This actually WORKS because Hono propagates middleware through mounted routers
	console.log('Has client:', data.hasClient);
	
	// The issue must be something else!
});

test('middleware path specificity - might be the issue', async () => {
	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	
	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter as any,
	}));

	// What if user is using a MORE SPECIFIC path in their middleware?
	const apiRouter = createRouter<{ Variables: CustomVariables }>();
	
	// Instead of '*', they might be using '/' or specific paths
	apiRouter.use('/', async (c, next) => {
		c.set('dbClient', {
			query: async () => ({ success: true }),
		});
		await next();
	});

	app.route('/api', apiRouter);

	const deployRouter = createRouter<{ Variables: CustomVariables }>();
	
	deployRouter.get('/', (c) => {
		return c.json({ hasClient: !!c.var.dbClient });
	});

	app.route('/api/deployments', deployRouter);

	// Test with '/' middleware
	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	console.log('With / middleware, has client:', data.hasClient);
});

test('TypeScript type safety - maybe c.var is not typed correctly', async () => {
	/**
	 * Maybe the issue is that TypeScript types aren't matching
	 * and c.var.dbClient is undefined at runtime even though
	 * the middleware ran
	 */
	
	const otel = register({ processors: [], logLevel: 'info' });
	
	// What if Variables interface isn't properly extended?
	const app = new Hono(); // No type parameter!
	
	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter as any,
	}));

	const apiRouter = new Hono();
	
	apiRouter.use('*', async (c, next) => {
		// Setting without proper types
		(c as any).set('dbClient', {
			query: async () => ({ success: true }),
		});
		await next();
	});

	app.route('/api', apiRouter);

	const deployRouter = new Hono();
	
	deployRouter.get('/', (c) => {
		// Accessing without proper types
		const client = (c as any).var.dbClient;
		return c.json({ hasClient: !!client });
	});

	app.route('/api/deployments', deployRouter);

	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	console.log('Without types, has client:', data.hasClient);
});

test('check if middleware is actually running', async () => {
	/**
	 * Add console.log to see if middleware is actually being called
	 */
	
	const otel = register({ processors: [], logLevel: 'info' });
	const app = new Hono<{ Variables: CustomVariables }>();
	
	app.use('*', createBaseMiddleware({
		logger: otel.logger,
		tracer: otel.tracer,
		meter: otel.meter as any,
	}));

	let middlewareCallCount = 0;

	const apiRouter = createRouter<{ Variables: CustomVariables }>();
	
	apiRouter.use('*', async (c, next) => {
		middlewareCallCount++;
		console.log(`Middleware called ${middlewareCallCount} times, path: ${c.req.path}`);
		c.set('dbClient', {
			query: async () => ({ success: true }),
		});
		await next();
	});

	app.route('/api', apiRouter);

	const deployRouter = createRouter<{ Variables: CustomVariables }>();
	
	deployRouter.get('/', (c) => {
		console.log('Deploy route handler, dbClient:', c.var.dbClient);
		return c.json({ hasClient: !!c.var.dbClient, callCount: middlewareCallCount });
	});

	app.route('/api/deployments', deployRouter);

	// Make request
	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	console.log('Result:', data);
	
	// If middleware is running, callCount should be > 0
	expect(middlewareCallCount).toBeGreaterThan(0);
});
