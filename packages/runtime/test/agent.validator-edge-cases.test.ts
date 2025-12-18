/**
 * Edge case tests for agent.validator()
 * Tests scenarios that might not be covered in the main test suite
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { createAgent } from '../src/agent';

describe('agent.validator() - Edge Cases', () => {
	test('validator({ output }) with no input schema (GET route pattern)', async () => {
		const agent = createAgent('get-agent', {
			schema: {
				// No input schema
				output: z.object({ items: z.array(z.string()) }),
			},
			handler: async () => ({ items: ['a', 'b', 'c'] }),
		});

		const app = new Hono().get('/items', agent.validator({ output: agent.outputSchema! }), async (c) => {
			// No input validation should occur
			return c.json({ items: ['a', 'b', 'c'] });
		});

		const res = await app.request('/items');
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toEqual({ items: ['a', 'b', 'c'] });
	});

	test('validator() with both input and output undefined', async () => {
		const agent = createAgent('no-schema-agent', {
			// No schema at all
			handler: async () => {
				return undefined;
			},
		});

		const app = new Hono().post('/test', agent.validator(), async (c) => {
			// Should accept any input
			return c.json({ ok: true });
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ anything: 'goes' }),
		});
		expect(res.status).toBe(200);
	});

	test('validator({ input, output }) both as overrides', async () => {
		const agent = createAgent('base-agent', {
			schema: {
				input: z.object({ oldField: z.string() }),
				output: z.object({ oldResult: z.string() }),
			},
			handler: async (_ctx, input) => ({ oldResult: input.oldField }),
		});

		const CustomInput = z.object({ newField: z.number() });
		const CustomOutput = z.object({ newResult: z.number() });

		const app = new Hono().post(
			'/override',
			agent.validator({ input: CustomInput, output: CustomOutput }),
			async (c) => {
				const data = c.req.valid('json');

				// TYPE CHECK: data should be typed as { newField: number }
				const field: number = data.newField;
				expect(field).toBe(42);

				return c.json({ newResult: data.newField * 2 });
			}
		);

		const res = await app.request('/override', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newField: 42 }),
		});
		expect(res.status).toBe(200);
		const result = await res.json();
		expect(result).toEqual({ newResult: 84 });
	});

	test('validator with optional fields in input schema', async () => {
		const agent = createAgent('optional-agent', {
			schema: {
				input: z.object({
					required: z.string(),
					optional: z.string().optional(),
				}),
				output: z.object({ result: z.string() }),
			},
			handler: async (_ctx, input) => ({
				result: `${input.required}-${input.optional ?? 'default'}`,
			}),
		});

		// Test without optional field
		const app1 = new Hono().post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE CHECK: optional field should be string | undefined
			const opt: string | undefined = data.optional;
			expect(data.required).toBe('test');
			expect(opt).toBeUndefined();

			return c.json({ result: 'ok' });
		});

		const res1 = await app1.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ required: 'test' }),
		});
		expect(res1.status).toBe(200);

		// Test with optional field
		const app2 = new Hono().post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE CHECK: optional field should be string | undefined
			const opt: string | undefined = data.optional;
			expect(data.required).toBe('test');
			expect(opt).toBe('value');

			return c.json({ result: 'ok' });
		});

		const res2 = await app2.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ required: 'test', optional: 'value' }),
		});
		expect(res2.status).toBe(200);
	});

	test('validator with union types in input', async () => {
		const agent = createAgent('union-agent', {
			schema: {
				input: z.object({
					value: z.union([z.string(), z.number()]),
				}),
				output: z.object({ type: z.string() }),
			},
			handler: async (_ctx, input) => ({
				type: typeof input.value,
			}),
		});

		const app = new Hono().post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE CHECK: value should be string | number
			const val: string | number = data.value;
			expect(['string', 'number']).toContain(typeof val);

			return c.json({ type: typeof data.value });
		});

		// Test with string
		const res1 = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 'hello' }),
		});
		expect(res1.status).toBe(200);

		// Test with number
		const res2 = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 42 }),
		});
		expect(res2.status).toBe(200);
	});

	test('validator with default values in schema', async () => {
		const agent = createAgent('default-agent', {
			schema: {
				input: z.object({
					name: z.string(),
					count: z.number().default(10),
				}),
				output: z.object({ result: z.number() }),
			},
			handler: async (_ctx, input) => ({ result: input.count }),
		});

		const app = new Hono().post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');
			return c.json({ result: data.count });
		});

		// Test without default field - should use default value
		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'test' }),
		});
		expect(res.status).toBe(200);
		const result = await res.json();
		expect(result).toEqual({ result: 10 });
	});

	test('validator with transformed input (using z.transform)', async () => {
		const agent = createAgent('transform-agent', {
			schema: {
				input: z.object({
					email: z.string().email().transform((e) => e.toLowerCase()),
				}),
				output: z.object({ email: z.string() }),
			},
			handler: async (_ctx, input) => ({ email: input.email }),
		});

		const app = new Hono().post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');

			// Transformed value should be lowercase
			expect(data.email).toBe('test@example.com');

			return c.json({ email: data.email });
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'TEST@EXAMPLE.COM' }),
		});
		expect(res.status).toBe(200);
		const result = await res.json();
		expect(result.email).toBe('test@example.com');
	});

	test('validator with refined schema (custom validation)', async () => {
		const agent = createAgent('refined-agent', {
			schema: {
				input: z
					.object({
						password: z.string(),
						confirmPassword: z.string(),
					})
					.refine((data) => data.password === data.confirmPassword, {
						message: "Passwords don't match",
						path: ['confirmPassword'],
					}),
				output: z.object({ success: z.boolean() }),
			},
			handler: async () => ({ success: true }),
		});

		const app = new Hono().post('/test', agent.validator(), async (c) => {
			return c.json({ success: true });
		});

		// Test with matching passwords
		const res1 = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: 'secret', confirmPassword: 'secret' }),
		});
		expect(res1.status).toBe(200);

		// Test with non-matching passwords
		const res2 = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: 'secret', confirmPassword: 'different' }),
		});
		expect(res2.status).toBe(400);
		const error = await res2.json();
		expect(error.error).toBe('Validation failed');
	});

	test('validator({ output }) override still validates input from agent schema', async () => {
		const agent = createAgent('output-only-override', {
			schema: {
				input: z.object({ data: z.string() }),
				output: z.object({ result: z.string() }),
			},
			handler: async (_ctx, input) => ({ result: input.data }),
		});

		const CustomOutput = z.object({ customField: z.number() });

		const app = new Hono().post(
			'/test',
			agent.validator({ output: CustomOutput }),
			async (c) => {
				const data = c.req.valid('json');
				// Input validation still happens from agent's input schema
				expect(data.data).toBe('test-value');
				return c.json({ customField: 42 });
			}
		);

		// Valid input according to agent's input schema
		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ data: 'test-value' }),
		});
		expect(res.status).toBe(200);
	});

	test('validator with empty object schema', async () => {
		const agent = createAgent('empty-schema-agent', {
			schema: {
				input: z.object({}),
				output: z.object({}),
			},
			handler: async () => ({}),
		});

		const app = new Hono().post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE CHECK: data should be empty object
			const _empty: Record<string, never> = data;

			return c.json({});
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
	});

	test('validator with stream: true and output override', async () => {
		const agent = createAgent('stream-override-agent', {
			schema: {
				input: z.object({ query: z.string() }),
				output: z.object({ result: z.string() }),
				stream: true,
			},
			handler: async (_ctx, input) => {
				return new ReadableStream({
					start(controller) {
						controller.enqueue(`Result: ${input.query}`);
						controller.close();
					},
				});
			},
		});

		const CustomOutput = z.object({ data: z.string() });

		const app = new Hono().post(
			'/stream',
			agent.validator({ output: CustomOutput }),
			async (c) => {
				const input = c.req.valid('json');
				expect(input.query).toBe('test');

				// Return non-stream response - output validation should be skipped due to stream: true
				return c.json({ data: 'response' });
			}
		);

		const res = await app.request('/stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'test' }),
		});
		expect(res.status).toBe(200);
	});

	test('validator with literal types', async () => {
		const agent = createAgent('literal-agent', {
			schema: {
				input: z.object({
					action: z.literal('delete'),
					type: z.enum(['user', 'post', 'comment']),
				}),
				output: z.object({ deleted: z.boolean() }),
			},
			handler: async () => ({ deleted: true }),
		});

		const app = new Hono().post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE CHECK: action should be literal 'delete'
			const action: 'delete' = data.action;
			// TYPE CHECK: type should be enum
			const type: 'user' | 'post' | 'comment' = data.type;

			expect(action).toBe('delete');
			expect(['user', 'post', 'comment']).toContain(type);

			return c.json({ deleted: true });
		});

		// Valid request
		const res1 = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete', type: 'user' }),
		});
		expect(res1.status).toBe(200);

		// Invalid action
		const res2 = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'create', type: 'user' }),
		});
		expect(res2.status).toBe(400);
	});
});
