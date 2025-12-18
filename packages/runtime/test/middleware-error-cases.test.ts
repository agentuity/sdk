/**
 * Test common middleware error patterns that would cause it to "not work"
 */

import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createRouter } from '../src/router';

interface CustomVariables {
	clickhouseClient?: { query: (sql: string) => Promise<any> };
	postgresClient?: { query: (sql: string) => Promise<any> };
}

test('middleware that forgets to call next() - breaks the chain', async () => {
	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// ❌ BROKEN: Forgets to call next()
	api.use('*', async (c, next) => {
		c.set('clickhouseClient', {
			query: async (sql) => ({ rows: [] }),
		});
		// Missing: await next();
	});

	// This middleware never runs because previous one didn't call next()
	api.use('*', async (c, next) => {
		c.set('postgresClient', {
			query: async (sql) => ({ rows: [] }),
		});
		await next();
	});

	app.route('/api', api);

	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();
	deploymentsRouter.get('/', (c) => {
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
			hasPostgres: !!c.var.postgresClient,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	const res = await app.request('/api/deployments');
	
	// Request hangs or returns empty because middleware chain broke
	console.log('Response status:', res.status);
	console.log('Response:', await res.text());
});

test('middleware that throws an error', async () => {
	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// ❌ BROKEN: Throws error
	api.use('*', async (c, next) => {
		throw new Error('ClickHouse connection failed!');
		// Never reaches here
		c.set('clickhouseClient', {
			query: async (sql) => ({ rows: [] }),
		});
		await next();
	});

	app.route('/api', api);

	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();
	deploymentsRouter.get('/', (c) => {
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	const res = await app.request('/api/deployments');
	
	// Should return 500 error, client never set
	expect(res.status).toBe(500);
});

test('middleware with conditional logic that skips setting variable', async () => {
	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// ❌ BROKEN: Only sets client if condition is met
	api.use('*', async (c, next) => {
		// Maybe checking for auth or environment
		const isAuthorized = false; // Oops!
		
		if (isAuthorized) {
			c.set('clickhouseClient', {
				query: async (sql) => ({ rows: [] }),
			});
		}
		
		await next();
	});

	app.route('/api', api);

	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();
	deploymentsRouter.get('/', (c) => {
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	// Client not set because condition was false
	expect(data.hasClickhouse).toBe(false);
});

test('middleware factory returns undefined instead of middleware function', async () => {
	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// ❌ BROKEN: clickhouseMiddleware() returns undefined
	const brokenMiddleware = () => {
		// Maybe forgot to return the middleware function?
		// Or async function that doesn't return anything
		return undefined as any;
	};

	try {
		api.use('*', brokenMiddleware());
		// This might throw or silently fail
	} catch (err) {
		console.log('Error using middleware:', err);
	}

	app.route('/api', api);

	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();
	deploymentsRouter.get('/', (c) => {
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	expect(data.hasClickhouse).toBe(false);
});

test('middleware async timing issue - not awaiting setup', async () => {
	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// ❌ POTENTIAL ISSUE: Async setup not awaited
	api.use('*', async (c, next) => {
		// Starts async operation but doesn't await
		Promise.resolve().then(() => {
			c.set('clickhouseClient', {
				query: async (sql) => ({ rows: [] }),
			});
		});
		
		// Calls next() before client is set!
		await next();
	});

	app.route('/api', api);

	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();
	deploymentsRouter.get('/', (c) => {
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	// Race condition - client might not be set yet
	console.log('Has client (race condition):', data.hasClickhouse);
});

test('CORRECT: middleware that works properly', async () => {
	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// ✅ CORRECT: Sets variable and calls next()
	api.use('*', async (c, next) => {
		c.set('clickhouseClient', {
			query: async (sql) => ({ rows: [{ id: 1 }] }),
		});
		await next();
	});

	api.use('*', async (c, next) => {
		c.set('postgresClient', {
			query: async (sql) => ({ rows: [{ id: 2 }] }),
		});
		await next();
	});

	app.route('/api', api);

	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();
	deploymentsRouter.get('/', (c) => {
		return c.json({
			hasClickhouse: !!c.var.clickhouseClient,
			hasPostgres: !!c.var.postgresClient,
		});
	});

	app.route('/api/deployments', deploymentsRouter);

	const res = await app.request('/api/deployments');
	const data = await res.json();
	
	expect(data.hasClickhouse).toBe(true);
	expect(data.hasPostgres).toBe(true);
});
