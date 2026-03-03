/**
 * Unit tests for route handlers and HTTP integration.
 * Tests routes without starting a real server using app.request().
 */

import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';
import { createAgent } from '../src/agent';
import { z } from 'zod';

describe('Route Handler Tests', () => {
	describe('Basic GET/POST routes', () => {
		test('GET route returns JSON', async () => {
			const app = new Hono().get('/hello', (c) => {
				return c.json({ message: 'Hello, World!' });
			});

			const res = await app.request('/hello', { method: 'GET' });

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ message: 'Hello, World!' });
		});

		test('POST route with JSON body', async () => {
			const app = new Hono();

			app.post('/echo', async (c) => {
				const body = await c.req.json();
				return c.json({ received: body });
			});

			const res = await app.request('/echo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Test', value: 123 }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({
				received: { name: 'Test', value: 123 },
			});
		});

		test('Route with path parameters', async () => {
			const app = new Hono();

			app.get('/users/:id', (c) => {
				const id = c.req.param('id');
				return c.json({ userId: id });
			});

			const res = await app.request('/users/123', { method: 'GET' });

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ userId: '123' });
		});

		test('Route with query parameters', async () => {
			const app = new Hono();

			app.get('/search', (c) => {
				const query = c.req.query('q');
				return c.json({ query });
			});

			const res = await app.request('/search?q=test%20search', { method: 'GET' });

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ query: 'test search' });
		});
	});

	describe('Error handling', () => {
		test('404 for non-existent route', async () => {
			const app = new Hono();

			app.get('/exists', (_c) => _c.json({ ok: true }));

			const res = await app.request('/does-not-exist', { method: 'GET' });

			expect(res.status).toBe(404);
		});

		test('Route throws error returns 500', async () => {
			const app = new Hono();

			app.get('/error', (_c) => {
				throw new Error('Test error');
			});

			app.onError((err, c) => {
				return c.json({ error: err.message }, 500);
			});

			const res = await app.request('/error', { method: 'GET' });

			expect(res.status).toBe(500);
			const data = await res.json();
			expect(data).toEqual({ error: 'Test error' });
		});
	});

	describe('Middleware', () => {
		test('Middleware adds header', async () => {
			const app = new Hono();

			app.use('*', async (c, next) => {
				c.header('X-Custom-Header', 'test-value');
				await next();
			});

			app.get('/test', (c) => c.json({ ok: true }));

			const res = await app.request('/test', { method: 'GET' });

			expect(res.status).toBe(200);
			expect(res.headers.get('X-Custom-Header')).toBe('test-value');
		});

		test('Middleware can short-circuit', async () => {
			const app = new Hono();

			app.use('/protected/*', async (c, next) => {
				const auth = c.req.header('Authorization');
				if (!auth) {
					return c.json({ error: 'Unauthorized' }, 401);
				}
				await next();
			});

			app.get('/protected/resource', (c) => c.json({ data: 'secret' }));

			// Without auth header
			const unauthorizedRes = await app.request('/protected/resource', { method: 'GET' });
			expect(unauthorizedRes.status).toBe(401);
			const errData = await unauthorizedRes.json();
			expect(errData).toEqual({ error: 'Unauthorized' });
		});
	});

	describe('Content-Type handling', () => {
		test('JSON response sets correct Content-Type', async () => {
			const app = new Hono();

			app.get('/json', (c) => c.json({ type: 'json' }));

			const res = await app.request('/json', { method: 'GET' });

			expect(res.headers.get('Content-Type')).toContain('application/json');
		});

		test('Text response', async () => {
			const app = new Hono();

			app.get('/text', (c) => c.text('Hello, World!'));

			const res = await app.request('/text', { method: 'GET' });

			expect(res.status).toBe(200);
			const contentType = res.headers.get('Content-Type');
			if (contentType) {
				expect(contentType).toContain('text/plain');
			}
			const text = await res.text();
			expect(text).toBe('Hello, World!');
		});

		test('HTML response', async () => {
			const app = new Hono();

			app.get('/html', (c) => c.html('<h1>Hello</h1>'));

			const res = await app.request('/html', { method: 'GET' });

			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Type')).toContain('text/html');
			const html = await res.text();
			expect(html).toBe('<h1>Hello</h1>');
		});
	});

	describe('Agent validator middleware', () => {
		test('validator validates input only (no output schema)', async () => {
			const agent = createAgent('test-agent', {
				schema: {
					input: z.object({ name: z.string(), age: z.number() }),
				},
				handler: async (_ctx, _input) => {},
			});

			const app = new Hono();
			app.post('/test', agent.validator(), async (c) => {
				const data = c.req.valid('json');
				return c.json({ received: data });
			});

			const res = await app.request('/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', age: 30 }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({
				received: { name: 'Alice', age: 30 },
			});
		});

		test('validator validates both input and output', async () => {
			const agent = createAgent('test-agent', {
				schema: {
					input: z.object({ name: z.string(), age: z.number() }),
					output: z.object({ result: z.string() }),
				},
				handler: async (_ctx, input) => ({ result: `${input.name} is ${input.age}` }),
			});

			const app = new Hono();
			app.post('/test', agent.validator(), async (c) => {
				const data = c.req.valid('json');
				// Return valid output matching schema
				return c.json({ result: `${data.name} is ${data.age}` });
			});

			const res = await app.request('/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', age: 30 }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ result: 'Alice is 30' });
		});

		test('validator rejects invalid input', async () => {
			const agent = createAgent('test-agent', {
				schema: {
					input: z.object({ name: z.string(), age: z.number() }),
					output: z.string(),
				},
				handler: async (_ctx, input) => `${input.name} is ${input.age}`,
			});

			const app = new Hono();
			app.post('/test', agent.validator(), async (c) => {
				const data = c.req.valid('json');
				return c.text(`${data.name} is ${data.age}`);
			});

			const res = await app.request('/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', age: 'thirty' }), // Invalid: age should be number
			});

			expect(res.status).toBe(400);
			const _data = (await res.json()) as { error: string };
			expect(_data.error).toBe('Validation failed');
		});

		test('validator rejects invalid output', async () => {
			const agent = createAgent('test-agent', {
				schema: {
					input: z.object({ name: z.string() }),
					output: z.object({ greeting: z.string() }),
				},
				handler: async (_ctx, input) => ({ greeting: `Hello, ${input.name}` }),
			});

			const app = new Hono();

			// Add error handler to catch output validation errors
			app.onError((err, c) => {
				return c.json({ error: err.message }, 500);
			});

			app.post('/test', agent.validator(), async (c) => {
				const _data = c.req.valid('json');
				// Return INVALID output (wrong shape)
				return c.json({ wrong: 'field' });
			});

			const res = await app.request('/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice' }),
			});

			// Should fail with 500 due to output validation error
			expect(res.status).toBe(500);
			const _data = (await res.json()) as { error: string };
			expect(_data.error).toContain('Output validation failed');
		});

		test('validator with custom input schema override (no output)', async () => {
			const agent = createAgent('test-agent', {
				schema: {
					input: z.object({ name: z.string() }),
				},
				handler: async (_ctx, _input) => {},
			});

			const app = new Hono();
			app.post(
				'/custom',
				// Override input schema, no output schema
				agent.validator({
					input: z.object({ id: z.string(), value: z.number() }),
				}),
				async (c) => {
					const data = c.req.valid('json');
					return c.json({ received: data });
				}
			);

			const res = await app.request('/custom', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'test-id', value: 42 }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({
				received: { id: 'test-id', value: 42 },
			});
		});
	});

	describe('Response status codes', () => {
		test('Custom status codes', async () => {
			const app = new Hono();

			app.post('/create', (c) => c.json({ created: true }, 201));
			app.delete('/delete', (c) => c.body(null, 204));
			app.get('/redirect', (c) => c.redirect('/new-location', 302));

			const createRes = await app.request('/create', { method: 'POST' });
			expect(createRes.status).toBe(201);

			const deleteRes = await app.request('/delete', { method: 'DELETE' });
			expect(deleteRes.status).toBe(204);

			const redirectRes = await app.request('/redirect', { method: 'GET' });
			expect(redirectRes.status).toBe(302);
		});
	});

	describe('Multiple routes', () => {
		test('Router with multiple HTTP methods on same path', async () => {
			const app = new Hono();

			app.get('/resource', (c) => c.json({ method: 'GET' }));
			app.post('/resource', (c) => c.json({ method: 'POST' }));
			app.put('/resource', (c) => c.json({ method: 'PUT' }));
			app.delete('/resource', (c) => c.json({ method: 'DELETE' }));

			const getRes = await app.request('/resource', { method: 'GET' });
			expect(((await getRes.json()) as { method: string }).method).toBe('GET');

			const postRes = await app.request('/resource', { method: 'POST' });
			expect(((await postRes.json()) as { method: string }).method).toBe('POST');

			const putRes = await app.request('/resource', { method: 'PUT' });
			expect(((await putRes.json()) as { method: string }).method).toBe('PUT');

			const deleteRes = await app.request('/resource', { method: 'DELETE' });
			expect(((await deleteRes.json()) as { method: string }).method).toBe('DELETE');
		});
	});
});
