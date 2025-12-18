/**
 * Debugging test - let's trace exactly what's happening
 */

import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createRouter } from '../src/router';

interface CustomVariables {
	clickhouseClient?: { query: (sql: string) => Promise<any> };
}

test('exact reproduction with console logging', async () => {
	const app = new Hono<{ Variables: CustomVariables }>();

	// src/api/index.ts
	const api = createRouter<{ Variables: CustomVariables }>();

	api.use('*', async (c, next) => {
		console.log('[MIDDLEWARE] Running on path:', c.req.path);
		c.set('clickhouseClient', {
			query: async (sql) => {
				console.log('[CLICKHOUSE] Query:', sql);
				return { rows: [{ id: 1 }] };
			},
		});
		console.log('[MIDDLEWARE] Set clickhouseClient');
		await next();
	});

	api.get('/test', (c) => {
		console.log('[ROUTE /api/test] clickhouseClient:', c.var.clickhouseClient);
		return c.json({ hasClient: !!c.var.clickhouseClient });
	});

	// Mount at /api
	app.route('/api', api);

	// src/api/deployments/route.ts
	const deploymentsRouter = createRouter<{ Variables: CustomVariables }>();

	deploymentsRouter.get('/', async (c) => {
		console.log('[ROUTE /api/deployments] clickhouseClient:', c.var.clickhouseClient);
		console.log('[ROUTE /api/deployments] c.var keys:', Object.keys(c.var));
		
		const client = c.var.clickhouseClient;
		if (!client) {
			return c.json({ error: 'No client', keys: Object.keys(c.var) }, 500);
		}
		
		return c.json({ success: true });
	});

	// Mount at /api/deployments
	app.route('/api/deployments', deploymentsRouter);

	console.log('\n=== Testing /api/test ===');
	const res1 = await app.request('/api/test');
	const data1 = await res1.json();
	console.log('Result:', data1);

	console.log('\n=== Testing /api/deployments ===');
	const res2 = await app.request('/api/deployments');
	const data2 = await res2.json();
	console.log('Result:', data2);
	console.log('Status:', res2.status);
});

test('check if Hono version matters', async () => {
	// Maybe the Hono version being used has different behavior?
	const { version } = await import('hono/package.json');
	console.log('Hono version:', version);
});
