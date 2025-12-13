import { describe, test, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { createMiddleware } from '../src/clerk/server';

describe('Clerk server middleware', () => {
	beforeEach(() => {
		process.env.CLERK_SECRET_KEY = 'sk_test_secret';
	});

	test('returns 401 when Authorization header is missing', async () => {
		const app = new Hono();
		app.use('/protected', createMiddleware());
		app.get('/protected', (c) => c.json({ success: true }));

		const res = await app.request('/protected', {
			method: 'GET',
		});

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({ error: 'Unauthorized' });
	});

	test('throws error when CLERK_SECRET_KEY is missing', () => {
		delete process.env.CLERK_SECRET_KEY;

		expect(() => createMiddleware()).toThrow('Clerk secret key is required');
	});

	test('creates middleware function', () => {
		const middleware = createMiddleware();
		expect(typeof middleware).toBe('function');
	});
});
