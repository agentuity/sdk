/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Runtime and compile-time tests for agent.validator()
 *
 * These tests verify both:
 * 1. Runtime validation behavior (expect() assertions)
 * 2. Compile-time type inference (inline type annotations)
 *
 * Type safety is validated by:
 * - Using typed variable assignments (e.g., const name: string = data.name)
 * - Passing data to functions with specific type signatures
 * - If types regress, these tests will fail during `bun run typecheck`
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { createAgent } from './agent';

describe('agent.validator()', () => {
	const testAgent = createAgent({
		metadata: { name: 'Test Agent' },
		schema: {
			input: z.object({ name: z.string(), age: z.number() }),
			output: z.string(),
		},
		handler: async (_ctx, input) => {
			return `Hello, ${input.name}! You are ${input.age} years old.`;
		},
	});

	test('validates input using agent schema', async () => {
		const app = new Hono();
		app.post('/test', testAgent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE ASSERTION: data should be typed as { name: string, age: number }
			const name: string = data.name;
			const age: number = data.age;
			expect(name).toBe('Alice');
			expect(age).toBe(30);

			return c.json(`${data.name}-${data.age}`);
		});

		const validRes = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Alice', age: 30 }),
		});
		expect(validRes.status).toBe(200);
		const validData: any = await validRes.json();
		expect(validData).toBe('Alice-30');
	});

	test('returns 400 on input validation failure', async () => {
		const app = new Hono();
		app.post('/test', testAgent.validator(), async (c) => {
			const data = c.req.valid('json');
			return c.json(`${data.name}-${data.age}`);
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Bob' }),
		});
		expect(res.status).toBe(400);
		const error: any = await res.json();
		expect(error).toHaveProperty('error', 'Validation failed');
		expect(error).toHaveProperty('issues');
		expect(Array.isArray(error.issues)).toBe(true);
	});

	test('overrides input schema', async () => {
		const customSchema = z.object({
			email: z.string().email(),
			count: z.number().min(1),
		});

		const app = new Hono();
		app.post('/test', testAgent.validator({ input: customSchema }), async (c) => {
			const data = c.req.valid('json');

			// TYPE ASSERTION: data should be typed from CUSTOM schema, not agent schema
			const email: string = data.email;
			const count: number = data.count;
			expect(email).toBeDefined();
			expect(count).toBeGreaterThan(0);

			return c.text('ok');
		});

		const validRes = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'test@example.com', count: 5 }),
		});
		expect(validRes.status).toBe(200);

		const invalidRes = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'invalid', count: 5 }),
		});
		expect(invalidRes.status).toBe(400);
	});

	test('supports middleware chaining', async () => {
		const app = new Hono();

		const testMiddleware = async (c: any, next: () => Promise<void>) => {
			(c as any).set('middlewareRan', true);
			await next();
		};

		app.post('/test', testAgent.validator(), testMiddleware, async (c) => {
			const data = c.req.valid('json');
			const middlewareRan = (c as any).get('middlewareRan');
			expect(middlewareRan).toBe(true);
			return c.json(`${data.name}-${data.age}`);
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Dave', age: 40 }),
		});
		expect(res.status).toBe(200);
		const result: any = await res.json();
		expect(result).toBe('Dave-40');
	});

	test('validates multiple fields with detailed errors', async () => {
		const complexSchema = z.object({
			email: z.string().email(),
			age: z.number().min(18).max(100),
			username: z.string().min(3).max(20),
		});

		const complexAgent = createAgent({
			metadata: { name: 'Complex' },
			schema: {
				input: complexSchema,
				output: z.string(),
			},
			handler: async () => 'ok',
		});

		const app = new Hono();
		app.post('/test', complexAgent.validator(), async (c) => {
			return c.text('ok');
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: 'invalid-email',
				age: 15,
				username: 'ab',
			}),
		});
		expect(res.status).toBe(400);
		const error: any = await res.json();
		expect(error.issues.length).toBeGreaterThan(0);
	});

	test('handles nested object validation', async () => {
		const nestedAgent = createAgent({
			metadata: { name: 'Nested' },
			schema: {
				input: z.object({
					user: z.object({
						name: z.string(),
						address: z.object({
							city: z.string(),
							zip: z.string(),
						}),
					}),
				}),
				output: z.string(),
			},
			handler: async () => 'ok',
		});

		const app = new Hono();
		app.post('/test', nestedAgent.validator(), async (c) => {
			const _data = c.req.valid('json');
			return c.text('ok');
		});

		const validRes = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user: {
					name: 'Alice',
					address: { city: 'NYC', zip: '10001' },
				},
			}),
		});
		expect(validRes.status).toBe(200);

		const invalidRes = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user: {
					name: 'Bob',
					address: { zip: '10001' },
				},
			}),
		});
		expect(invalidRes.status).toBe(400);
		const error: any = await invalidRes.json();
		expect(error.message).toContain('city');
	});

	test('validates arrays in input', async () => {
		const arrayAgent = createAgent({
			metadata: { name: 'Array Agent' },
			schema: {
				input: z.object({
					items: z.array(z.string()),
					count: z.number(),
				}),
				output: z.number(),
			},
			handler: async (_ctx, input) => input.items.length,
		});

		const app = new Hono();
		app.post('/test', arrayAgent.validator(), async (c) => {
			const data = c.req.valid('json');
			return c.json(data.items.length);
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ items: ['a', 'b', 'c'], count: 3 }),
		});
		expect(res.status).toBe(200);
		const result: any = await res.json();
		expect(result).toBe(3);
	});

	test('agent with input-only schema (no output)', async () => {
		// Agent with input but NO output schema
		// Handler should be constrained to return void/undefined
		const inputOnlyAgent = createAgent({
			metadata: { name: 'Input Only' },
			schema: {
				input: z.string(),
				// NO output schema
			},
			handler: async (_ctx, input) => {
				// Handler must return void when no output schema
				console.log(`Received: ${input}`);
				return undefined;
			},
		});

		const app = new Hono();
		app.post('/test', inputOnlyAgent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE ASSERTION: data should be typed as string (the input schema)
			const input: string = data;
			expect(input).toBe('test-input');

			return c.text('processed');
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify('test-input'),
		});
		expect(res.status).toBe(200);
	});

	test('handles streaming agent without output schema', async () => {
		const streamAgent = createAgent({
			metadata: { name: 'Stream Agent' },
			schema: {
				input: z.object({ message: z.string() }),
				stream: true,
			},
			handler: async (_ctx, input) => {
				return new ReadableStream({
					start(controller) {
						controller.enqueue(`Message: ${input.message}`);
						controller.close();
					},
				});
			},
		});

		const app = new Hono();
		app.post('/test', streamAgent.validator(), async (c) => {
			const data = c.req.valid('json');

			// TYPE ASSERTION: data should have 'message' property typed as string
			const msg: string = data.message;
			expect(msg).toBe('test');

			// TYPE ASSERTION: Should be able to pass to function expecting the type
			const validate = (input: { message: string }) => input.message;
			expect(validate(data)).toBe('test');

			return c.text('ok');
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'test' }),
		});
		expect(res.status).toBe(200);
	});

	test('middleware before validator can modify context', async () => {
		const app = new Hono();

		const authMiddleware = async (c: any, next: () => Promise<void>) => {
			c.set('userId', 'user-123');
			c.set('authenticated', true);
			await next();
		};

		app.post('/test', authMiddleware, testAgent.validator(), async (c) => {
			const data = c.req.valid('json');
			const userId = (c as any).get('userId');
			const authenticated = (c as any).get('authenticated');

			expect(userId).toBe('user-123');
			expect(authenticated).toBe(true);

			return c.json(`${data.name}-${data.age}`);
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Eve', age: 35 }),
		});
		expect(res.status).toBe(200);
		const result: any = await res.json();
		expect(result).toBe('Eve-35');
	});

	test('middleware after validator receives validated data', async () => {
		const app = new Hono();

		const loggingMiddleware = async (c: any, next: () => Promise<void>) => {
			const data = c.req.valid('json');
			c.set('loggedName', data.name);
			await next();
		};

		app.post('/test', testAgent.validator(), loggingMiddleware, async (c) => {
			const data = c.req.valid('json');
			const loggedName = (c as any).get('loggedName');

			expect(loggedName).toBe(data.name);
			return c.json(`${data.name}-${data.age}`);
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Frank', age: 45 }),
		});
		expect(res.status).toBe(200);
	});

	test('multiple middleware with validator in chain', async () => {
		const app = new Hono();

		const middleware1 = async (c: any, next: () => Promise<void>) => {
			c.set('step1', true);
			await next();
		};

		const middleware2 = async (c: any, next: () => Promise<void>) => {
			c.set('step2', true);
			await next();
		};

		const middleware3 = async (c: any, next: () => Promise<void>) => {
			c.set('step3', true);
			await next();
		};

		app.post('/test', middleware1, testAgent.validator(), middleware2, middleware3, async (c) => {
			const data = c.req.valid('json');
			expect((c as any).get('step1')).toBe(true);
			expect((c as any).get('step2')).toBe(true);
			expect((c as any).get('step3')).toBe(true);
			return c.json(`${data.name}-${data.age}`);
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test', age: 30 }),
		});
		expect(res.status).toBe(200);
		const result: any = await res.json();
		expect(result).toBe('Test-30');
	});

	test('validation fails before subsequent middleware runs', async () => {
		const app = new Hono();

		let middlewareRan = false;

		const afterValidationMiddleware = async (c: any, next: () => Promise<void>) => {
			middlewareRan = true;
			await next();
		};

		app.post('/test', testAgent.validator(), afterValidationMiddleware, async (c) => {
			return c.text('ok');
		});

		// Invalid request - middleware should NOT run
		middlewareRan = false;
		await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ invalid: 'data' }),
		});

		expect(middlewareRan).toBe(false);
	});

	test('middleware can short-circuit before validator', async () => {
		const app = new Hono();

		const blockMiddleware = async (c: any, next: () => Promise<void>) => {
			const body = await c.req.json();
			if (body.blocked) {
				return c.json({ error: 'Blocked by middleware' }, 403);
			}
			await next();
		};

		app.post('/test', blockMiddleware, testAgent.validator(), async (c) => {
			const data = c.req.valid('json');
			return c.json(`${data.name}-${data.age}`);
		});

		// Blocked request returns 403, validation never runs
		const blockedRes = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test', age: 30, blocked: true }),
		});
		expect(blockedRes.status).toBe(403);

		// Non-blocked request validates normally
		const allowedRes = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test', age: 30 }),
		});
		expect(allowedRes.status).toBe(200);
	});
});

describe('agent.validator() - output validation', () => {
	test('validates output against agent schema', async () => {
		const agent = createAgent({
			metadata: { name: 'Output Test' },
			schema: {
				input: z.object({ value: z.number() }),
				output: z.object({ result: z.number() }),
			},
			handler: async (_ctx, input) => ({ result: input.value * 2 }),
		});

		const app = new Hono();
		app.post('/test', agent.validator(), async (c) => {
			const data = c.req.valid('json');
			// Return properly formatted output matching the schema
			return c.json({ result: data.value * 2 });
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 5 }),
		});
		expect(res.status).toBe(200);
		const result: any = await res.json();
		expect(result).toEqual({ result: 10 });
	});

	test('throws 500 on output validation failure', async () => {
		const agent = createAgent({
			metadata: { name: 'Bad Output' },
			schema: {
				input: z.object({ value: z.number() }),
				output: z.object({ result: z.number() }),
			},
			handler: async () => ({ result: 5 }),
		});

		const app = new Hono();
		app.post('/test', agent.validator(), async (c) => {
			// Handler returns wrong type - should cause output validation error
			return c.json({ wrong: 'type' });
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 5 }),
		});
		expect(res.status).toBe(500);
	});

	test('output validation with override schema', async () => {
		const agent = createAgent({
			metadata: { name: 'Override Output' },
			schema: {
				input: z.object({ x: z.number() }),
				output: z.string(),
			},
			handler: async () => 'default',
		});

		const customOutput = z.object({ count: z.number() });

		const app = new Hono();
		app.post('/test', agent.validator({ output: customOutput }), async (c) => {
			return c.json({ count: 42 });
		});

		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ x: 1 }),
		});
		expect(res.status).toBe(200);
		const result: any = await res.json();
		expect(result).toEqual({ count: 42 });
	});
});

test('skips output validation for streaming agents', async () => {
	const streamingAgent = createAgent({
		metadata: { name: 'Streaming' },
		schema: {
			input: z.object({ data: z.string() }),
			output: z.string(),
			stream: true,
		},
		handler: async (_ctx, input) => {
			return new ReadableStream({
				start(controller) {
					controller.enqueue(input.data);
					controller.close();
				},
			});
		},
	});

	const app = new Hono();
	app.post('/test', streamingAgent.validator(), async (c) => {
		const data = c.req.valid('json');
		// Return any JSON - output validation should be skipped for streams
		return c.json({ stream: 'response', data: data.data });
	});

	const res = await app.request('/test', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ data: 'test' }),
	});
	// Should succeed even though output doesn't match schema (stream validation skipped)
	expect(res.status).toBe(200);
	const result: any = await res.json();
	expect(result.data).toBe('test');
});
