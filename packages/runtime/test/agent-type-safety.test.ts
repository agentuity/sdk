/**
 * Type safety tests for agent.validator() integration with Hono.
 *
 * These tests verify that developer-facing API provides end-to-end type safety:
 * 1. agent.validator() properly types c.req.valid('json') in route handlers
 * 2. Input validation catches invalid data at runtime
 * 3. Output validation ensures responses match schemas
 *
 * Note: We use app.request() for testing instead of testClient() due to
 * Hono's type inference limitations with method-chained apps.
 */

import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';
import { createAgent } from '../src/agent';
import { z } from 'zod';

describe('Agent Validator Type Safety', () => {
	test('agent.validator() provides typed c.req.valid("json")', async () => {
		const agent = createAgent('user-agent', {
			schema: {
				input: z.object({
					name: z.string(),
					email: z.string().email(),
					age: z.number().min(0),
				}),
				output: z.object({
					id: z.string(),
					success: z.boolean(),
				}),
			},
			handler: async (_ctx, _input) => ({
				id: 'user-test',
				success: true,
			}),
		});

		const app = new Hono().post('/users', agent.validator(), async (c) => {
			const data = c.req.valid('json');

			// Type check: These assignments verify TypeScript infers correct types
			const _name: string = data.name;
			const _email: string = data.email;
			const _age: number = data.age;

			return c.json({
				id: `user-${data.name}`,
				success: true,
			});
		});

		const res = await app.request('/users', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'Alice',
				email: 'alice@example.com',
				age: 30,
			}),
		});

		expect(res.status).toBe(200);
		const result = await res.json();
		expect(result).toEqual({ id: 'user-Alice', success: true });
	});

	test('validator with custom schemas overrides agent schema', async () => {
		const agent = createAgent('flexible', {
			schema: {
				input: z.object({ default: z.string() }),
			},
			handler: async (_ctx, _input) => {},
		});

		const app = new Hono().post(
			'/custom',
			agent.validator({
				input: z.object({
					customField: z.string(),
					count: z.number(),
				}),
			}),
			async (c) => {
				const data = c.req.valid('json');

				// Type check: Override schema types
				const _custom: string = data.customField;
				const _count: number = data.count;

				return c.json({ processed: true, count: data.count });
			}
		);

		const res = await app.request('/custom', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ customField: 'test', count: 42 }),
		});

		expect(res.status).toBe(200);
		const result = await res.json();
		expect(result).toEqual({ processed: true, count: 42 });
	});

	test('input validation rejects invalid data', async () => {
		const agent = createAgent('strict', {
			schema: {
				input: z.object({
					email: z.string().email(),
					age: z.number().min(18).max(100),
				}),
			},
			handler: async (_ctx, _input) => {},
		});

		const app = new Hono().post('/validate', agent.validator(), async (c) => {
			const data = c.req.valid('json');
			return c.json({ success: true, data });
		});

		// Invalid email
		const invalidEmail = await app.request('/validate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'not-an-email', age: 25 }),
		});
		expect(invalidEmail.status).toBe(400);

		// Age too young
		const tooYoung = await app.request('/validate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'valid@example.com', age: 16 }),
		});
		expect(tooYoung.status).toBe(400);

		// Valid data
		const valid = await app.request('/validate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'valid@example.com', age: 25 }),
		});
		expect(valid.status).toBe(200);
	});

	test('output validation catches schema mismatches', async () => {
		const agent = createAgent('output-validator', {
			schema: {
				input: z.object({ value: z.string() }),
				output: z.object({
					result: z.string(),
					length: z.number(),
				}),
			},
			handler: async (_ctx, input) => ({
				result: input.value,
				length: input.value.length,
			}),
		});

		const app = new Hono().post('/process', agent.validator(), async (c) => {
			const data = c.req.valid('json');
			// Return invalid output (missing required field)
			return c.json({
				result: data.value,
				// length is missing!
			} as { result: string });
		});

		const res = await app.request('/process', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 'test' }),
		});

		// Output validation error becomes 500
		expect(res.status).toBe(500);
	});

	test('multiple routes maintain independent type safety', async () => {
		const userAgent = createAgent('user', {
			schema: {
				input: z.object({ name: z.string() }),
				output: z.object({ userId: z.string() }),
			},
			handler: async (_ctx, input) => ({ userId: `user-${input.name}` }),
		});

		const postAgent = createAgent('post', {
			schema: {
				input: z.object({ title: z.string(), content: z.string() }),
				output: z.object({ postId: z.string() }),
			},
			handler: async (_ctx, input) => ({ postId: `post-${input.title}` }),
		});

		const app = new Hono()
			.post('/users', userAgent.validator(), async (c) => {
				const data = c.req.valid('json');
				const _name: string = data.name; // Type check
				return c.json({ userId: `user-${data.name}` });
			})
			.post('/posts', postAgent.validator(), async (c) => {
				const data = c.req.valid('json');
				// Type check: Different schema
				const _title: string = data.title;
				const _content: string = data.content;
				return c.json({ postId: `post-${data.title}` });
			});

		// Test user endpoint
		const userRes = await app.request('/users', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Alice' }),
		});
		expect(userRes.status).toBe(200);
		const userData = await userRes.json();
		expect(userData).toEqual({ userId: 'user-Alice' });

		// Test post endpoint
		const postRes = await app.request('/posts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: 'Hello', content: 'World' }),
		});
		expect(postRes.status).toBe(200);
		const postData = await postRes.json();
		expect(postData).toEqual({ postId: 'post-Hello' });
	});

	test('GET route with output-only validation', async () => {
		const agent = createAgent('list', {
			handler: async (_ctx) => {},
		});

		const app = new Hono().get(
			'/items',
			agent.validator({
				output: z.array(z.object({ id: z.string(), name: z.string() })),
			}),
			async (c) => {
				return c.json([
					{ id: '1', name: 'Item 1' },
					{ id: '2', name: 'Item 2' },
				]);
			}
		);

		const res = await app.request('/items', { method: 'GET' });
		expect(res.status).toBe(200);
		const items = await res.json();
		expect(Array.isArray(items)).toBe(true);
		expect(items).toHaveLength(2);
	});
});
