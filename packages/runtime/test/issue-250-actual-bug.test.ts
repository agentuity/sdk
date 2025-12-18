/**
 * GitHub Issue #250 - Actual Bug Found!
 * 
 * The clickhouse middleware throws an error if env vars are missing,
 * which breaks the middleware chain and prevents c.set() from being called.
 */

import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createRouter } from '../src/router';

interface CustomVariables {
	clickhouse?: any;
	postgres?: any;
}

test('ACTUAL BUG: middleware throws error when env vars missing', async () => {
	/**
	 * From clickhouse.ts lines 20-24:
	 * 
	 * if (!host || !username || !password || !database) {
	 *   throw new Error('Missing ClickHouse configuration...');
	 * }
	 * 
	 * This throws BEFORE c.set('clickhouse', ...) is called!
	 * So the middleware chain breaks and subsequent middleware doesn't run.
	 */

	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// Simulate clickhouseMiddleware() with missing env vars
	api.use('*', async (c, next) => {
		// getClient() throws here if env vars missing
		const host = process.env.CLICKHOUSE_HOST;
		if (!host) {
			throw new Error('Missing ClickHouse configuration');
		}
		
		// Never reaches here if throw happens above
		c.set('clickhouse', { query: async () => ({}) });
		await next();
	});

	// This middleware never runs if previous one throws
	api.use('*', async (c, next) => {
		c.set('postgres', { query: async () => ({}) });
		await next();
	});

	app.route('/api', api);

	const servicesRouter = createRouter<{ Variables: CustomVariables }>();
	servicesRouter.get('/', (c) => {
		const clickhouse = c.get('clickhouse');
		return c.json({ hasClickhouse: !!clickhouse });
	});

	app.route('/api/services', servicesRouter);

	// Request fails with 500 error
	const res = await app.request('/api/services');
	expect(res.status).toBe(500);
	
	const text = await res.text();
	expect(text).toContain('Missing ClickHouse configuration');
});

test('SOLUTION: Handle errors gracefully in middleware', async () => {
	/**
	 * Middleware should catch errors and either:
	 * 1. Skip setting the client (let route handle missing client)
	 * 2. Return error response early
	 * 3. Set a null/undefined client that routes can check
	 */

	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// ✅ OPTION 1: Skip setting client if config missing
	api.use('*', async (c, next) => {
		try {
			const host = process.env.CLICKHOUSE_HOST;
			if (!host) {
				// Don't set client, but don't throw either
				c.var.logger?.warn('ClickHouse config missing, skipping client setup');
				await next();
				return;
			}
			
			c.set('clickhouse', { query: async () => ({}) });
		} catch (error) {
			c.var.logger?.error('Failed to create ClickHouse client:', error);
			// Continue anyway
		}
		
		await next();
	});

	// This middleware runs even if previous one failed
	api.use('*', async (c, next) => {
		c.set('postgres', { query: async () => ({}) });
		await next();
	});

	app.route('/api', api);

	const servicesRouter = createRouter<{ Variables: CustomVariables }>();
	servicesRouter.get('/', (c) => {
		const clickhouse = c.get('clickhouse');
		
		if (!clickhouse) {
			return c.json({ error: 'ClickHouse not available' }, 503);
		}
		
		return c.json({ hasClickhouse: true });
	});

	app.route('/api/services', servicesRouter);

	// Route handles missing client gracefully
	const res = await app.request('/api/services');
	expect(res.status).toBe(503);
	
	const data = await res.json();
	expect(data.error).toBe('ClickHouse not available');
});

test('SOLUTION 2: Lazy initialization in middleware', async () => {
	/**
	 * Better pattern: Don't create client in middleware, 
	 * create a factory function that routes can call
	 */

	const app = new Hono<{ Variables: CustomVariables }>();

	const api = createRouter<{ Variables: CustomVariables }>();

	// Middleware sets a getter function, not the actual client
	api.use('*', async (c, next) => {
		c.set('clickhouse', {
			get client() {
				const host = process.env.CLICKHOUSE_HOST;
				if (!host) {
					throw new Error('Missing ClickHouse config');
				}
				// Create client lazily only when accessed
				return { query: async () => ({}) };
			}
		});
		
		await next();
	});

	app.route('/api', api);

	const servicesRouter = createRouter<{ Variables: CustomVariables }>();
	servicesRouter.get('/', (c) => {
		try {
			const clickhouse = c.get('clickhouse')?.client;
			return c.json({ hasClickhouse: !!clickhouse });
		} catch (error) {
			return c.json({ error: 'ClickHouse not configured' }, 503);
		}
	});

	app.route('/api/services', servicesRouter);

	// Route handles missing config gracefully
	const res = await app.request('/api/services');
	expect(res.status).toBe(503);
});
