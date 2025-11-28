import { test } from 'bun:test';
import { expectTypeOf } from 'expect-type';
import { createAgent, type AppState } from '../src/agent';
import { z } from 'zod';

test('Handler with input schema - parameters should NOT be any', () => {
	const agentWithInput = createAgent({
		metadata: { name: 'Test Agent' },
		schema: {
			input: z.object({ name: z.string(), age: z.number() }),
			output: z.string(),
		},
		handler: async (ctx, input) => {
			expectTypeOf(ctx).not.toBeAny();
			expectTypeOf(input).toEqualTypeOf<{ name: string; age: number }>();
			expectTypeOf(input).not.toBeAny();
			return 'result';
		},
	});

	expectTypeOf(agentWithInput).not.toBeAny();
});

test('Handler without input schema - should only have ctx parameter', () => {
	const agentWithoutInput = createAgent({
		metadata: { name: 'No Input Agent' },
		schema: {
			output: z.string(),
		},
		handler: async (ctx) => {
			expectTypeOf(ctx).not.toBeAny();
			return 'result';
		},
	});

	expectTypeOf(agentWithoutInput).not.toBeAny();
});

test('Setup function - parameter and return type should be typed', () => {
	const agentWithSetup = createAgent({
		metadata: { name: 'Setup Agent' },
		setup: async (_app: AppState) => {
			// app must be explicitly typed for inference to work
			return { foo: 'bar', count: 42 };
		},
		handler: async (ctx) => {
			// Config type is inferred from setup return value
			// Test that properties are correctly typed (not any)
			expectTypeOf(ctx.config.foo).toBeString();
			expectTypeOf(ctx.config.count).toBeNumber();

			// Verify type safety - these would be compile errors if uncommented:
			// const wrong: number = ctx.config.foo; // Error: Type 'string' is not assignable to type 'number'
			// const missing = ctx.config.bar; // Error: Property 'bar' does not exist
		},
	});

	expectTypeOf(agentWithSetup).not.toBeAny();
});

test('Shutdown function - parameters should be typed', () => {
	const agentWithShutdown = createAgent({
		metadata: { name: 'Shutdown Agent' },
		setup: async (_app: AppState) => {
			// app must be explicitly typed for inference to work
			return { connection: 'active' };
		},
		handler: async () => {},
		shutdown: async (app, config) => {
			expectTypeOf(app).not.toBeAny();
			expectTypeOf(config).not.toBeAny();
			const connection: string = config.connection;
			expectTypeOf(connection).toBeString();
		},
	});

	expectTypeOf(agentWithShutdown).not.toBeAny();
});

test('Streaming agent - return type should be ReadableStream', () => {
	const streamingAgent = createAgent({
		metadata: { name: 'Streaming Agent' },
		schema: {
			input: z.string(),
			output: z.number(),
			stream: true,
		},
		handler: async (ctx, input) => {
			expectTypeOf(input).toEqualTypeOf<string>();
			expectTypeOf(input).not.toBeAny();
			return new ReadableStream<number>();
		},
	});

	expectTypeOf(streamingAgent).not.toBeAny();
});
