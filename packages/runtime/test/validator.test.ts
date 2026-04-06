import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { validator } from '../src/validator';
import { s } from '@agentuity/schema';

describe('validator middleware', () => {
	describe('GET routes', () => {
		test('validates query parameters', async () => {
			const app = new Hono();

			app.get(
				'/search',
				validator({
					input: s.object({ q: s.string(), limit: s.coerce.number().optional() }),
					output: s.array(s.object({ id: s.string() })),
				}),
				async (c) => {
					const query = c.req.valid('query');
					return c.json([{ id: query.q }]);
				}
			);

			// Valid request
			const res = await app.request('/search?q=test');
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual([{ id: 'test' }]);
		});

		test('returns 400 for invalid query parameters', async () => {
			const app = new Hono();

			app.get(
				'/search',
				validator({
					input: s.object({ q: s.string() }),
				}),
				async (c) => {
					const query = c.req.valid('query');
					return c.json({ query });
				}
			);

			// Missing required param
			const res = await app.request('/search');
			expect(res.status).toBe(400);
			const error = await res.json();
			expect(error.error).toBe('Validation failed');
			expect(error.issues).toBeDefined();
		});

		test('output-only validation for GET', async () => {
			const app = new Hono();

			app.get(
				'/users',
				validator({
					output: s.array(s.object({ id: s.string(), name: s.string() })),
				}),
				async (c) => {
					return c.json([
						{ id: '1', name: 'Alice' },
						{ id: '2', name: 'Bob' },
					]);
				}
			);

			const res = await app.request('/users');
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual([
				{ id: '1', name: 'Alice' },
				{ id: '2', name: 'Bob' },
			]);
		});
	});

	describe('POST routes', () => {
		test('validates JSON body', async () => {
			const app = new Hono();

			app.post(
				'/users',
				validator({
					input: s.object({ name: s.string(), email: s.string() }),
					output: s.object({ id: s.string(), name: s.string(), email: s.string() }),
				}),
				async (c) => {
					const data = c.req.valid('json');
					return c.json({ id: '123', ...data });
				}
			);

			// Valid request
			const res = await app.request('/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ id: '123', name: 'Alice', email: 'alice@example.com' });
		});

		test('returns 400 for invalid JSON body', async () => {
			const app = new Hono();

			app.post(
				'/users',
				validator({
					input: s.object({ name: s.string(), email: s.string().email() }),
				}),
				async (c) => {
					const data = c.req.valid('json');
					return c.json(data);
				}
			);

			// Invalid email
			const res = await app.request('/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', email: 'not-an-email' }),
			});

			expect(res.status).toBe(400);
			const error = await res.json();
			expect(error.error).toBe('Validation failed');
		});

		test('validates output schema', async () => {
			const app = new Hono();

			app.post(
				'/create',
				validator({
					input: s.object({ name: s.string() }),
					output: s.object({ id: s.string(), name: s.string() }),
				}),
				async (c) => {
					const data = c.req.valid('json');
					// Return invalid output (missing id)
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return c.json({ name: data.name } as any);
				}
			);

			const res = await app.request('/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice' }),
			});

			// Should throw 500 due to output validation failure
			expect(res.status).toBe(500);
		});
	});

	describe('PUT/PATCH/DELETE routes', () => {
		test('validates body for PUT request', async () => {
			const app = new Hono();

			app.put(
				'/users/:id',
				validator({
					input: s.object({ name: s.string() }),
					output: s.object({ id: s.string(), name: s.string() }),
				}),
				async (c) => {
					const data = c.req.valid('json');
					return c.json({ id: c.req.param('id'), ...data });
				}
			);

			const res = await app.request('/users/123', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Updated' }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ id: '123', name: 'Updated' });
		});

		test('validates body for PATCH request', async () => {
			const app = new Hono();

			app.patch(
				'/users/:id',
				validator({
					input: s.object({ name: s.string().optional() }),
				}),
				async (c) => {
					const data = c.req.valid('json');
					return c.json({ id: c.req.param('id'), ...data });
				}
			);

			const res = await app.request('/users/123', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Patched' }),
			});

			expect(res.status).toBe(200);
		});

		test('validates body for DELETE request', async () => {
			const app = new Hono();

			app.delete(
				'/users/:id',
				validator({
					input: s.object({ reason: s.string() }),
					output: s.object({ deleted: s.boolean() }),
				}),
				async (c) => {
					const _data = c.req.valid('json');
					return c.json({ deleted: true });
				}
			);

			const res = await app.request('/users/123', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason: 'Account closed' }),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual({ deleted: true });
		});
	});

	describe('type safety', () => {
		test('input types flow correctly for GET', async () => {
			const app = new Hono();

			app.get(
				'/test',
				validator({
					// Query params are strings, use coerce for numbers
					input: s.object({ id: s.string(), count: s.coerce.number() }),
				}),
				async (c) => {
					const query = c.req.valid('query');
					// TypeScript should infer: { id: string, count: number }
					const id: string = query.id;
					const count: number = query.count;
					return c.json({ id, count });
				}
			);

			const res = await app.request('/test?id=abc&count=5');
			expect(res.status).toBe(200);
		});

		test('input types flow correctly for POST', async () => {
			const app = new Hono();

			app.post(
				'/test',
				validator({
					input: s.object({ name: s.string(), active: s.boolean() }),
				}),
				async (c) => {
					const data = c.req.valid('json');
					// TypeScript should infer: { name: string, active: boolean }
					const name: string = data.name;
					const active: boolean = data.active;
					return c.json({ name, active });
				}
			);

			const res = await app.request('/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Test', active: true }),
			});

			expect(res.status).toBe(200);
		});
	});
});
