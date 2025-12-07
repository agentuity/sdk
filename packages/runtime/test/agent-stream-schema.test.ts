import { test, expect } from 'bun:test';
import { expectTypeOf } from 'expect-type';
import { createAgent, runInAgentContext } from '../src/agent';
import { z } from 'zod';
import { TestAgentContext } from './helpers/test-context';

test('Streaming agent with output schema - should return ReadableStream<Type>', async () => {
	const streamingAgentWithSchema = createAgent('streaming-with-schema', {
		schema: {
			input: z.object({ message: z.string() }),
			output: z.object({ id: z.number(), text: z.string() }),
			stream: true,
		},
		handler: async (ctx, input) => {
			expectTypeOf(input).toEqualTypeOf<{ message: string }>();

			const stream = new ReadableStream<{ id: number; text: string }>({
				start(controller) {
					controller.enqueue({ id: 1, text: input.message });
					controller.enqueue({ id: 2, text: `Echo: ${input.message}` });
					controller.close();
				},
			});

			return stream;
		},
	});

	const ctx = new TestAgentContext();
	const result = await runInAgentContext(ctx, streamingAgentWithSchema, { message: 'Hello' });

	expectTypeOf(result).toEqualTypeOf<ReadableStream<{ id: number; text: string }>>();
	expectTypeOf<Awaited<ReturnType<typeof streamingAgentWithSchema.run>>>().toEqualTypeOf<
		ReadableStream<{ id: number; text: string }>
	>();
	expect(result).toBeInstanceOf(ReadableStream);

	const reader = result.getReader();
	const chunks: Array<{ id: number; text: string }> = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	expect(chunks).toHaveLength(2);
	expect(chunks[0]).toEqual({ id: 1, text: 'Hello' });
	expect(chunks[1]).toEqual({ id: 2, text: 'Echo: Hello' });
});

test('Streaming agent without output schema - should return ReadableStream<unknown>', async () => {
	const streamingAgentWithoutSchema = createAgent('streaming-without-schema', {
		schema: {
			input: z.object({ count: z.number() }),
			stream: true,
		},
		handler: async (ctx, input) => {
			expectTypeOf(input).toEqualTypeOf<{ count: number }>();

			const stream = new ReadableStream<unknown>({
				start(controller) {
					for (let i = 0; i < input.count; i++) {
						controller.enqueue(`Item ${i}`);
					}
					controller.close();
				},
			});

			return stream;
		},
	});

	const ctx = new TestAgentContext();
	const result = await runInAgentContext(ctx, streamingAgentWithoutSchema, { count: 3 });

	expectTypeOf(result).toEqualTypeOf<ReadableStream<unknown>>();
	expectTypeOf<Awaited<ReturnType<typeof streamingAgentWithoutSchema.run>>>().toEqualTypeOf<
		ReadableStream<unknown>
	>();
	expect(result).toBeInstanceOf(ReadableStream);

	const reader = result.getReader();
	const chunks: unknown[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	expect(chunks).toHaveLength(3);
	expect(chunks).toEqual(['Item 0', 'Item 1', 'Item 2']);
});

test('Streaming agent with primitive output schema - should return ReadableStream<primitive>', async () => {
	const streamingPrimitiveAgent = createAgent('streaming-primitive', {
		schema: {
			input: z.string(),
			output: z.number(),
			stream: true,
		},
		handler: async (ctx, input) => {
			expectTypeOf(input).toEqualTypeOf<string>();

			const stream = new ReadableStream<number>({
				start(controller) {
					const num = parseInt(input, 10);
					controller.enqueue(num);
					controller.enqueue(num * 2);
					controller.enqueue(num * 3);
					controller.close();
				},
			});

			return stream;
		},
	});

	const ctx = new TestAgentContext();
	const result = await runInAgentContext(ctx, streamingPrimitiveAgent, '5');

	expectTypeOf(result).toEqualTypeOf<ReadableStream<number>>();
	expectTypeOf<Awaited<ReturnType<typeof streamingPrimitiveAgent.run>>>().toEqualTypeOf<
		ReadableStream<number>
	>();
	expect(result).toBeInstanceOf(ReadableStream);

	const reader = result.getReader();
	const chunks: number[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	expect(chunks).toEqual([5, 10, 15]);
});

test('Non-streaming agent with output schema - should return Type directly', async () => {
	const nonStreamingAgent = createAgent('non-streaming', {
		schema: {
			input: z.object({ name: z.string() }),
			output: z.object({ greeting: z.string() }),
		},
		handler: async (ctx, input) => {
			expectTypeOf(input).toEqualTypeOf<{ name: string }>();
			return { greeting: `Hello ${input.name}` };
		},
	});

	const ctx = new TestAgentContext();
	const result = await runInAgentContext(ctx, nonStreamingAgent, { name: 'World' });

	expectTypeOf(result).toEqualTypeOf<{ greeting: string }>();
	expectTypeOf<Awaited<ReturnType<typeof nonStreamingAgent.run>>>().toEqualTypeOf<{
		greeting: string;
	}>();
	expect(result).toEqual({ greeting: 'Hello World' });
});
