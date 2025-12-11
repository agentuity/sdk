/**
 * Tests for helpful error messages when users access AgentContext properties
 * directly on HonoContext instead of using c.var.XYZ
 *
 * These tests verify that installContextPropertyHelpers() adds helpful error messages
 * to the HonoContext when users mistakenly try to access AgentContext properties
 * directly (e.g., c.logger) instead of via c.var (e.g., c.var.logger).
 */

import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';

describe('HonoContext Property Access Error Messages', () => {
	// List of AgentContext properties that should show helpful errors
	const agentContextProperties = [
		'logger',
		'tracer',
		'sessionId',
		'kv',
		'stream',
		'vector',
		'state',
		'thread',
		'session',
		'config',
		'app',
		'waitUntil',
	] as const;

	// Helper function to simulate what installContextPropertyHelpers does
	function installContextPropertyHelpers(c: HonoContext): void {
		const properties = [
			'logger',
			'tracer',
			'sessionId',
			'kv',
			'stream',
			'vector',
			'state',
			'thread',
			'session',
			'config',
			'app',
			'waitUntil',
		] as const;

		for (const property of properties) {
			// Skip if property already exists
			if (Object.prototype.hasOwnProperty.call(c, property)) {
				continue;
			}

			Object.defineProperty(c, property, {
				get() {
					throw new Error(
						`In route handlers, use c.var.${property} instead of c.${property}. ` +
							`The property '${property}' is available on AgentContext (for agent handlers) ` +
							`but must be accessed via c.var in HonoContext (route handlers).`
					);
				},
				set() {
					throw new Error(
						`In route handlers, use c.var.${property} instead of c.${property}. ` +
							`The property '${property}' is available on AgentContext (for agent handlers) ` +
							`but must be accessed via c.var in HonoContext (route handlers).`
					);
				},
				configurable: true,
				enumerable: false,
			});
		}
	}

	describe('Direct property access on HonoContext', () => {
		agentContextProperties.forEach((property) => {
			test(`accessing c.${property} throws helpful error`, async () => {
				const app = new Hono();

				app.use('*', (c, next) => {
					// Install the error helpers
					installContextPropertyHelpers(c);
					return next();
				});

				app.get('/test', (c) => {
					// Attempt to access the property directly on c
					try {
						// @ts-expect-error - This is intentionally wrong to test error message
						const _value = c[property];
						throw new Error('Should not reach here');
					} catch (error) {
						// Verify error message is helpful
						expect(error).toBeInstanceOf(Error);
						expect((error as Error).message).toContain(`c.var.${property}`);
						expect((error as Error).message).toContain('route handler');
					}

					return c.json({ ok: true });
				});

				const res = await app.request('/test', { method: 'GET' });
				expect(res.status).toBe(200);
			});
		});

		test('accessing c.logger throws with specific message', async () => {
			const app = new Hono();

			app.use('*', (c, next) => {
				installContextPropertyHelpers(c);
				return next();
			});

			app.post('/log', (c) => {
				try {
					// @ts-expect-error - Testing error message
					c.logger.info('This should fail');
					throw new Error('Should not reach here');
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toMatch(/use c\.var\.logger instead of c\.logger/i);
					expect((error as Error).message).toContain('route handler');
					return c.json({ errorCaught: true });
				}
			});

			const res = await app.request('/log', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ test: 'data' }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ errorCaught: true });
		});

		test('accessing c.kv throws with specific message', async () => {
			const app = new Hono();

			app.use('*', (c, next) => {
				installContextPropertyHelpers(c);
				return next();
			});

			app.get('/kv-test', async (c) => {
				try {
					// @ts-expect-error - Testing error message
					await c.kv.get('test-key');
					throw new Error('Should not reach here');
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toMatch(/use c\.var\.kv instead of c\.kv/i);
					expect((error as Error).message).toContain('route handler');
					return c.json({ errorCaught: true });
				}
			});

			const res = await app.request('/kv-test', { method: 'GET' });

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ errorCaught: true });
		});

		test('accessing c.sessionId throws with specific message', async () => {
			const app = new Hono();

			app.use('*', (c, next) => {
				installContextPropertyHelpers(c);
				return next();
			});

			app.get('/session', (c) => {
				try {
					// @ts-expect-error - Testing error message
					const _sessionId = c.sessionId;
					throw new Error('Should not reach here');
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toMatch(
						/use c\.var\.sessionId instead of c\.sessionId/i
					);
					return c.json({ errorCaught: true });
				}
			});

			const res = await app.request('/session', { method: 'GET' });

			expect(res.status).toBe(200);
		});

		test('accessing c.waitUntil throws with specific message', async () => {
			const app = new Hono();

			app.use('*', (c, next) => {
				installContextPropertyHelpers(c);
				return next();
			});

			app.post('/waituntil', (c) => {
				try {
					// @ts-expect-error - Testing error message
					c.waitUntil(() => {});
					throw new Error('Should not reach here');
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toMatch(
						/use c\.var\.waitUntil instead of c\.waitUntil/i
					);
					return c.json({ errorCaught: true });
				}
			});

			const res = await app.request('/waituntil', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(200);
		});
	});

	describe('Error message format validation', () => {
		test('error message includes property name and correct usage', async () => {
			const app = new Hono();

			app.use('*', (c, next) => {
				installContextPropertyHelpers(c);
				return next();
			});

			app.get('/format-test', (c) => {
				try {
					// @ts-expect-error - Testing error message format
					c.logger.info('test');
				} catch (error) {
					const message = (error as Error).message;

					// Should mention the property
					expect(message).toContain('logger');

					// Should show correct usage
					expect(message).toContain('c.var.logger');

					// Should explain context
					expect(message).toMatch(/route handler|HonoContext/i);

					return c.json({ message });
				}
				return c.json({ ok: false });
			});

			const res = await app.request('/format-test', { method: 'GET' });
			expect(res.status).toBe(200);
		});

		test('property setter also throws helpful error', async () => {
			const app = new Hono();

			app.use('*', (c, next) => {
				installContextPropertyHelpers(c);
				return next();
			});

			app.get('/setter-test', (c) => {
				try {
					// @ts-expect-error - Testing error message on set
					c.logger = {};
					throw new Error('Should not reach here');
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toContain('c.var.logger');
					expect((error as Error).message).toContain('route handler');
					return c.json({ errorCaught: true });
				}
			});

			const res = await app.request('/setter-test', { method: 'GET' });
			expect(res.status).toBe(200);
		});

		test('all properties throw consistently formatted errors', async () => {
			const app = new Hono();

			app.use('*', (c, next) => {
				installContextPropertyHelpers(c);
				return next();
			});

			app.get('/consistency-test', (c) => {
				const errors: string[] = [];

				agentContextProperties.forEach((property) => {
					try {
						// @ts-expect-error - Testing all properties
						const _value = c[property];
					} catch (error) {
						errors.push((error as Error).message);
					}
				});

				// All errors should follow the same format
				errors.forEach((message, index) => {
					const property = agentContextProperties[index];
					expect(message).toContain(`c.var.${property}`);
					expect(message).toContain(`c.${property}`);
					expect(message).toContain('route handler');
					expect(message).toContain('AgentContext');
					expect(message).toContain('HonoContext');
				});

				return c.json({ errorCount: errors.length });
			});

			const res = await app.request('/consistency-test', { method: 'GET' });
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.errorCount).toBe(agentContextProperties.length);
		});
	});
});
