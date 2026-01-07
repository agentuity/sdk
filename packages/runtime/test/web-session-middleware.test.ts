/**
 * Tests for web session middleware behavior.
 *
 * Verifies that createWebSessionMiddleware:
 * - Does NOT set sessionId/thread in Hono context
 * - Does NOT set x-session-id or x-thread-id response headers
 *   (preventing sessions from being associated with Catalyst)
 *
 * Note: Cookie setting tests require proper thread provider initialization
 * which is tested in integration tests. This unit test focuses on the
 * "no context, no headers" behavior.
 */

import { test, expect, describe } from 'bun:test';

describe('Web Session Middleware', () => {
	test('does not set x-session-id response header', async () => {
		// Import dynamically to get fresh instance
		const { Hono } = await import('hono');
		const { createWebSessionMiddleware } = await import('../src/middleware');

		const app = new Hono();
		app.use('*', createWebSessionMiddleware());
		app.get('/test', (c) => c.json({ ok: true }));

		const res = await app.request('/test', {
			method: 'GET',
		});

		// Should NOT have session header - this is the key behavioral difference
		expect(res.headers.get('x-session-id')).toBeNull();
	});

	test('does not set x-thread-id response header', async () => {
		const { Hono } = await import('hono');
		const { createWebSessionMiddleware } = await import('../src/middleware');

		const app = new Hono();
		app.use('*', createWebSessionMiddleware());
		app.get('/test', (c) => c.json({ ok: true }));

		const res = await app.request('/test', {
			method: 'GET',
		});

		// Should NOT have thread header
		expect(res.headers.get('x-thread-id')).toBeNull();
	});

	test('does not set sessionId in context', async () => {
		const { Hono } = await import('hono');
		const { createWebSessionMiddleware } = await import('../src/middleware');

		const app = new Hono();
		app.use('*', createWebSessionMiddleware());

		let capturedSessionId: string | undefined;
		app.get('/test', (c) => {
			capturedSessionId = c.get('sessionId');
			return c.json({ ok: true });
		});

		await app.request('/test', {
			method: 'GET',
		});

		// Context should NOT have sessionId - web analytics doesn't need it
		expect(capturedSessionId).toBeUndefined();
	});

	test('does not set thread in context', async () => {
		const { Hono } = await import('hono');
		const { createWebSessionMiddleware } = await import('../src/middleware');

		const app = new Hono();
		app.use('*', createWebSessionMiddleware());

		let capturedThread: { id: string } | undefined;
		app.get('/test', (c) => {
			capturedThread = c.get('thread');
			return c.json({ ok: true });
		});

		await app.request('/test', {
			method: 'GET',
		});

		// Context should NOT have thread - web analytics doesn't need it
		expect(capturedThread).toBeUndefined();
	});
});
