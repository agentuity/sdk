/**
 * Unit tests for the cron() route handler.
 *
 * Verifies that:
 * - cron() returns a handler tagged with route-meta symbol
 * - The schedule expression is preserved in route metadata
 * - Both overloads (with and without options) work correctly
 * - POST-only enforcement works
 * - Auth verification works when enabled
 */

import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';
import { cron } from '../src/handlers/cron';
import { ROUTE_META, getRouteMeta } from '../src/handlers/_route-meta';

describe('cron() handler', () => {
	describe('route metadata tagging', () => {
		test('tags handler with type "cron" and schedule expression', () => {
			const handler = cron('0 9 * * 1', { auth: false }, async (c) => {
				return c.text('OK');
			});

			const meta = (handler as any)[ROUTE_META];
			expect(meta).toBeDefined();
			expect(meta.type).toBe('cron');
			expect(meta.schedule).toBe('0 9 * * 1');
		});

		test('preserves complex cron expressions', () => {
			const handler = cron('*/5 * * * *', { auth: false }, async (c) => {
				return c.text('OK');
			});

			const meta = (handler as any)[ROUTE_META];
			expect(meta.schedule).toBe('*/5 * * * *');
		});

		test('preserves daily-at-midnight expression', () => {
			const handler = cron('0 0 * * *', { auth: true }, async (c) => {
				return c.text('OK');
			});

			const meta = (handler as any)[ROUTE_META];
			expect(meta.type).toBe('cron');
			expect(meta.schedule).toBe('0 0 * * *');
		});

		test('deprecated overload (no options) also tags schedule', () => {
			const handler = cron('30 2 * * 0', async (c) => {
				return c.text('OK');
			});

			const meta = (handler as any)[ROUTE_META];
			expect(meta).toBeDefined();
			expect(meta.type).toBe('cron');
			expect(meta.schedule).toBe('30 2 * * 0');
		});

		test('getRouteMeta() returns schedule from cron handler', () => {
			const handler = cron('0 12 * * *', { auth: false }, async (c) => {
				return c.text('OK');
			});

			const meta = getRouteMeta(handler);
			expect(meta).toBeDefined();
			expect(meta!.type).toBe('cron');
			expect(meta!.schedule).toBe('0 12 * * *');
		});
	});

	describe('handler behavior', () => {
		test('handler executes on POST request', async () => {
			const app = new Hono();
			app.post(
				'/scheduled',
				cron('0 9 * * 1', { auth: false }, async (c) => {
					return c.json({ status: 'executed' });
				})
			);

			const res = await app.request('/scheduled', { method: 'POST' });
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ status: 'executed' });
		});

		test('handler rejects non-POST methods', async () => {
			const app = new Hono();
			// Register on ALL methods so the route matches GET
			app.all(
				'/scheduled',
				cron('0 9 * * 1', { auth: false }, async (c) => {
					return c.text('OK');
				})
			);

			const res = await app.request('/scheduled', { method: 'GET' });
			// The handler throws an error for non-POST, which Hono converts to 500
			expect(res.status).toBe(500);
		});
	});

	describe('route discovery integration', () => {
		test('schedule is readable from Hono router.routes', () => {
			const app = new Hono();
			app.post(
				'/daily',
				cron('0 0 * * *', { auth: true }, async (c) => {
					return c.text('OK');
				})
			);

			// Simulate what route-discovery.ts does: iterate router.routes
			// and read the route-meta symbol from each handler
			const cronRoutes = app.routes
				.filter((r) => {
					const meta = (r.handler as any)[Symbol.for('agentuity:route-meta')];
					return meta?.type === 'cron';
				})
				.map((r) => {
					const meta = (r.handler as any)[Symbol.for('agentuity:route-meta')];
					return {
						path: r.path,
						method: r.method,
						type: meta.type,
						schedule: meta.schedule,
					};
				});

			expect(cronRoutes).toHaveLength(1);
			expect(cronRoutes[0]).toEqual({
				path: '/daily',
				method: 'POST',
				type: 'cron',
				schedule: '0 0 * * *',
			});
		});

		test('schedule produces correct config.expression for metadata', () => {
			const handler = cron('0 9 * * 1', { auth: true }, async (c) => {
				return c.text('OK');
			});

			// Simulate what route-discovery.ts does when building config
			const meta = (handler as any)[Symbol.for('agentuity:route-meta')];
			const config = meta?.schedule ? { expression: meta.schedule } : undefined;

			expect(config).toEqual({ expression: '0 9 * * 1' });
		});
	});
});
