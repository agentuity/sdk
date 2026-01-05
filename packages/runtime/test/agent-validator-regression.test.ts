/**
 * Regression tests for agent.validator() - testing all permutations
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createAgent, createRouter, validator } from '../src/index';
import { s } from '@agentuity/schema';

describe('agent.validator() regression tests', () => {
	describe('agent without output schema', () => {
		const agentInputOnly = createAgent('input-only-agent', {
			schema: {
				input: s.object({
					name: s.string(),
					email: s.string(),
					age: s.number(),
				}),
			},
			handler: async (_ctx, input) => {
				return { success: true, message: `Hello ${input.name}` };
			},
		});

		test('agent.validator() with createRouter validates input', async () => {
			const router = createRouter();
			
			router.post('/', agentInputOnly.validator(), async (c) => {
				const data = c.req.valid('json');
				return c.json({ success: true, user: data });
			});

			// Valid request
			const validRes = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', age: 30 }),
			});
			expect(validRes.status).toBe(200);
			const validData = await validRes.json();
			expect(validData).toEqual({
				success: true,
				user: { name: 'Alice', email: 'alice@example.com', age: 30 },
			});

			// Invalid request - missing age
			const invalidRes = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Bob', email: 'bob@example.com' }),
			});
			expect(invalidRes.status).toBe(400);
			const errorData = await invalidRes.json();
			expect(errorData.error).toBe('Validation failed');
		});

		test('agent.validator() with plain Hono validates input', async () => {
			const app = new Hono();
			
			app.post('/', agentInputOnly.validator(), async (c) => {
				const data = c.req.valid('json');
				return c.json({ success: true, user: data });
			});

			// Valid request
			const validRes = await app.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', age: 30 }),
			});
			expect(validRes.status).toBe(200);

			// Invalid request
			const invalidRes = await app.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Bob' }), // missing email and age
			});
			expect(invalidRes.status).toBe(400);
		});
	});

	describe('agent with input and output schema', () => {
		const agentWithOutput = createAgent('full-agent', {
			schema: {
				input: s.object({
					name: s.string(),
					email: s.string(),
				}),
				output: s.object({
					success: s.boolean(),
					user: s.object({
						name: s.string(),
						email: s.string(),
					}),
				}),
			},
			handler: async (_ctx, input) => {
				return { success: true, user: input };
			},
		});

		test('agent.validator() validates both input and output', async () => {
			const router = createRouter();
			
			router.post('/', agentWithOutput.validator(), async (c) => {
				const data = c.req.valid('json');
				return c.json({ success: true, user: data });
			});

			// Valid request
			const validRes = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
			});
			expect(validRes.status).toBe(200);

			// Invalid input
			const invalidInput = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Bob' }), // missing email
			});
			expect(invalidInput.status).toBe(400);
		});

		test('output validation fails with wrong response', async () => {
			const router = createRouter();
			
			router.post('/', agentWithOutput.validator(), async (c) => {
				const _data = c.req.valid('json');
				// Return wrong shape - should fail output validation
				return c.json({ wrong: 'response' });
			});

			const res = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
			});
			expect(res.status).toBe(500); // Output validation fails with 500
		});
	});

	describe('agent.validator() with custom schema override', () => {
		const baseAgent = createAgent('base-agent', {
			schema: {
				input: s.object({ name: s.string() }),
				output: s.string(),
			},
			handler: async (_ctx, input) => `Hello ${input.name}`,
		});

		test('can override input schema', async () => {
			// Regression test: input-only override should not apply agent's output schema
			// Agent expects string output, but we return object - should succeed (200, not 500)
			const router = createRouter();
			const customInput = s.object({
				email: s.string().email(),
				count: s.number(),
			});
			
			router.post('/', baseAgent.validator({ input: customInput }), async (c) => {
				const data = c.req.valid('json');
				return c.json({ email: data.email, count: data.count });
			});

			// Valid with custom schema
			const validRes = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', count: 5 }),
			});
			expect(validRes.status).toBe(200);

			// Invalid email
			const invalidRes = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'not-an-email', count: 5 }),
			});
			expect(invalidRes.status).toBe(400);
		});
	});

	describe('standalone validator function vs agent.validator()', () => {
		test('standalone validator() works with schema', async () => {
			const router = createRouter();
			const schema = s.object({
				name: s.string(),
				email: s.string(),
				age: s.number(),
			});
			
			router.post('/', validator({ input: schema }), async (c) => {
				const data = c.req.valid('json');
				return c.json({ success: true, user: data });
			});

			const validRes = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', age: 30 }),
			});
			expect(validRes.status).toBe(200);

			const invalidRes = await router.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Bob' }),
			});
			expect(invalidRes.status).toBe(400);
		});
	});
});
