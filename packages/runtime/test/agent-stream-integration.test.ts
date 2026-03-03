import { test, expect } from 'bun:test';
import { expectTypeOf } from 'expect-type';
import { createAgent, runInAgentContext } from '../src/agent';
import { Hono } from 'hono';
import { z } from 'zod';
import { TestAgentContext } from './helpers/test-context';

test('Integration: streaming agent with output schema in route', async () => {
	const streamingAgent = createAgent('stream-with-schema', {
		schema: {
			input: z.object({ query: z.string() }),
			output: z.object({ result: z.string(), timestamp: z.number() }),
			stream: true,
		},
		handler: async (_ctx, input) => {
			const stream = new ReadableStream<{ result: string; timestamp: number }>({
				start(controller) {
					controller.enqueue({ result: `Processing: ${input.query}`, timestamp: Date.now() });
					controller.enqueue({ result: `Completed: ${input.query}`, timestamp: Date.now() });
					controller.close();
				},
			});

			expectTypeOf(stream).toEqualTypeOf<
				ReadableStream<{ result: string; timestamp: number }>
			>();

			return stream;
		},
	});

	const app = new Hono();
	app.post('/stream', streamingAgent.validator(), async (c) => {
		const data = c.req.valid('json');
		expectTypeOf(data).toEqualTypeOf<{ query: string }>();

		const ctx = new TestAgentContext();
		const stream = await runInAgentContext(ctx, streamingAgent, data);
		expectTypeOf(stream).toEqualTypeOf<ReadableStream<{ result: string; timestamp: number }>>();
		expectTypeOf<Awaited<ReturnType<typeof streamingAgent.run>>>().toEqualTypeOf<
			ReadableStream<{ result: string; timestamp: number }>
		>();

		return c.body(stream);
	});

	const res = await app.request('/stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query: 'test-query' }),
	});

	expect(res.status).toBe(200);
	expect(res.body).toBeInstanceOf(ReadableStream);
});

test('Integration: streaming agent without output schema in route', async () => {
	const streamingAgentNoSchema = createAgent('stream-no-schema', {
		schema: {
			input: z.object({ items: z.array(z.string()) }),
			stream: true,
		},
		handler: async (_ctx, input) => {
			const stream = new ReadableStream<unknown>({
				start(controller) {
					for (const item of input.items) {
						controller.enqueue(item);
					}
					controller.close();
				},
			});

			expectTypeOf(stream).toEqualTypeOf<ReadableStream<unknown>>();

			return stream;
		},
	});

	const app = new Hono();
	app.post('/stream-unknown', streamingAgentNoSchema.validator(), async (c) => {
		const data = c.req.valid('json');
		expectTypeOf(data).toEqualTypeOf<{ items: string[] }>();

		const ctx = new TestAgentContext();
		const stream = await runInAgentContext(ctx, streamingAgentNoSchema, data);
		expectTypeOf(stream).toEqualTypeOf<ReadableStream<unknown>>();
		expectTypeOf<Awaited<ReturnType<typeof streamingAgentNoSchema.run>>>().toEqualTypeOf<
			ReadableStream<unknown>
		>();

		return c.body(stream);
	});

	const res = await app.request('/stream-unknown', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ items: ['a', 'b', 'c'] }),
	});

	expect(res.status).toBe(200);
	expect(res.body).toBeInstanceOf(ReadableStream);
});

test('Integration: streaming agent with custom validator schema', async () => {
	const streamingAgent = createAgent('stream-custom-validator', {
		schema: {
			input: z.object({ text: z.string() }),
			output: z.number(),
			stream: true,
		},
		handler: async (_ctx, _input) => {
			return new ReadableStream<number>({
				start(controller) {
					controller.enqueue(1);
					controller.enqueue(2);
					controller.enqueue(3);
					controller.close();
				},
			});
		},
	});

	const app = new Hono();
	app.post(
		'/custom-stream',
		streamingAgent.validator({
			input: z.object({ text: z.string(), priority: z.number() }),
		}),
		async (c) => {
			const data = c.req.valid('json');
			expectTypeOf(data).toEqualTypeOf<{ text: string; priority: number }>();

			expect(data.text).toBe('test');
			expect(data.priority).toBe(5);

			const ctx = new TestAgentContext();
			const stream = await runInAgentContext(ctx, streamingAgent, { text: data.text });
			expectTypeOf(stream).toEqualTypeOf<ReadableStream<number>>();
			expectTypeOf<Awaited<ReturnType<typeof streamingAgent.run>>>().toEqualTypeOf<
				ReadableStream<number>
			>();

			return c.body(stream);
		}
	);

	const res = await app.request('/custom-stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text: 'test', priority: 5 }),
	});

	expect(res.status).toBe(200);
});

test('Integration: mixed streaming and non-streaming agents', async () => {
	const streamingAgent = createAgent('mixed-stream', {
		schema: {
			input: z.object({ value: z.string() }),
			output: z.string(),
			stream: true,
		},
		handler: async (_ctx, input) => {
			return new ReadableStream<string>({
				start(controller) {
					controller.enqueue(input.value);
					controller.close();
				},
			});
		},
	});

	const nonStreamingAgent = createAgent('mixed-non-stream', {
		schema: {
			input: z.object({ value: z.string() }),
			output: z.object({ result: z.string() }),
		},
		handler: async (_ctx, input) => {
			return { result: input.value.toUpperCase() };
		},
	});

	const app = new Hono();

	app.post('/stream', streamingAgent.validator(), async (c) => {
		const data = c.req.valid('json');
		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, streamingAgent, data);
		expectTypeOf(result).toEqualTypeOf<ReadableStream<string>>();
		expectTypeOf<Awaited<ReturnType<typeof streamingAgent.run>>>().toEqualTypeOf<
			ReadableStream<string>
		>();
		return c.body(result);
	});

	app.post('/non-stream', nonStreamingAgent.validator(), async (c) => {
		const data = c.req.valid('json');
		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, nonStreamingAgent, data);
		expectTypeOf(result).toEqualTypeOf<{ result: string }>();
		expectTypeOf<Awaited<ReturnType<typeof nonStreamingAgent.run>>>().toEqualTypeOf<{
			result: string;
		}>();
		return c.json(result);
	});

	const streamRes = await app.request('/stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ value: 'stream-data' }),
	});
	expect(streamRes.status).toBe(200);
	expect(streamRes.body).toBeInstanceOf(ReadableStream);

	const nonStreamRes = await app.request('/non-stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ value: 'non-stream-data' }),
	});
	expect(nonStreamRes.status).toBe(200);
	const json = (await nonStreamRes.json()) as { result: string };
	expect(json.result).toBe('NON-STREAM-DATA');
});
