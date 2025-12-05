/**
 * Unit tests for agent execution, schema validation, and core functionality.
 * Tests agents in isolation without requiring HTTP server or real services.
 */

import { test, expect, describe } from 'bun:test';
import { createAgent, runInAgentContext } from '../src/agent';
import { z } from 'zod';
import { TestAgentContext } from './helpers/test-context';
import { createMockLoggerWithCapture } from '@agentuity/test-utils';

describe('Agent Execution', () => {
	test('agent with input schema executes handler', async () => {
		const agent = createAgent('test', {
			schema: {
				input: z.object({ name: z.string() }),
				output: z.string(),
			},
			handler: async (ctx, input) => `Hello, ${input.name}!`,
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent, { name: 'World' });

		expect(result).toBe('Hello, World!');
	});

	test('agent without input schema executes handler', async () => {
		const agent = createAgent('no-input', {
			schema: {
				output: z.string(),
			},
			handler: async (_ctx) => 'No input needed',
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent);
		expect(result).toBe('No input needed');
	});

	test('agent without output schema returns void', async () => {
		let executed = false;

		const agent = createAgent('no-output', {
			schema: {
				input: z.string(),
			},
			handler: async (_ctx, _input) => {
				executed = true;
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent, 'test');
		expect(executed).toBe(true);
		expect(result).toBeUndefined();
	});

	test('agent with no schema returns void', async () => {
		let executed = false;
		const agent = createAgent('minimal', {
			handler: async (_ctx) => {
				executed = true;
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent);
		expect(executed).toBe(true);
		expect(result).toBeUndefined();
	});
});

describe('Agent Context Access', () => {
	test('agent can access logger', async () => {
		const { logger, logs } = createMockLoggerWithCapture();

		const agent = createAgent('logger-test', {
			handler: async (ctx) => {
				ctx.logger.info('test message');
			},
		});

		const ctx = new TestAgentContext({ logger });
		await runInAgentContext(ctx, agent);

		expect(logs).toContain('test message');
	});

	test('agent can access sessionId', async () => {
		const agent = createAgent('session-test', {
			schema: {
				output: z.string(),
			},
			handler: async (ctx) => ctx.sessionId,
		});

		const ctx = new TestAgentContext({ sessionId: 'custom-session' });

		const result = await runInAgentContext(ctx, agent);

		expect(result).toBe('custom-session');
	});

	test('agent can access agent metadata via internal symbol', async () => {
		const agent = createAgent('name-test', {
			schema: {
				output: z.string(),
			},
			handler: async (_ctx) => {
				// Access internal CURRENT_AGENT symbol for telemetry
				const { getCurrentAgentMetadata } = await import('../src/_context');
				const metadata = getCurrentAgentMetadata();
				return metadata?.name || 'unknown';
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent);

		expect(result).toBe('name-test'); // Matches agent metadata.name
	});

	test('agent can access state map', async () => {
		const agent = createAgent('state-test', {
			schema: {
				output: z.string(),
			},
			handler: async (ctx) => {
				ctx.state.set('key', 'value');
				const value = ctx.state.get('key');
				return value as string;
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent);
		expect(result).toBe('value');
	});
});

describe('Agent Services', () => {
	test('agent can use KeyValue storage', async () => {
		const agent = createAgent('kv-test', {
			schema: {
				input: z.object({ key: z.string(), value: z.string() }),
				output: z.object({ success: z.boolean(), retrieved: z.string() }),
			},
			handler: async (ctx, input) => {
				await ctx.kv.set('test-store', input.key, input.value);
				const result = await ctx.kv.get<string>('test-store', input.key);
				return {
					success: result.exists,
					retrieved: result.data as string,
				};
			},
		});

		const ctx = new TestAgentContext();

		const result = await runInAgentContext<
			{ key: string; value: string },
			{ success: boolean; retrieved: string }
		>(ctx, agent, { key: 'test-key', value: 'test-value' });

		expect(result.success).toBe(true);
		expect(result.retrieved).toBe('test-value');
	});

	test('agent can use StreamStorage', async () => {
		const agent = createAgent('stream-test', {
			schema: {
				output: z.object({ streamId: z.string() }),
			},
			handler: async (ctx) => {
				const stream = await ctx.stream.create('test-stream');
				await stream.write('chunk1');
				await stream.write('chunk2');
				return { streamId: stream.id };
			},
		});

		const ctx = new TestAgentContext();

		const result = await runInAgentContext<void, { streamId: string }>(ctx, agent);
		expect(result.streamId).toMatch(/stream-\d+/);
	});

	test('agent can use VectorStorage', async () => {
		const agent = createAgent('vector-test', {
			schema: {
				output: z.object({ found: z.boolean() }),
			},
			handler: async (ctx) => {
				await ctx.vector.upsert('test-vectors', {
					key: 'doc1',
					document: 'Machine learning',
					metadata: { topic: 'AI' },
				});

				const result = await ctx.vector.get('test-vectors', 'doc1');
				return { found: result.exists };
			},
		});

		const ctx = new TestAgentContext();

		const result = await runInAgentContext<void, { found: boolean }>(ctx, agent);
		expect(result.found).toBe(true);
	});
});

describe('Agent Setup and Shutdown', () => {
	test('agent setup provides config to handler', async () => {
		type TestConfig = { database: string; cache: Map<unknown, unknown> };

		const agent = createAgent('setup-test', {
			setup: async (_app: unknown) => ({
				database: 'mock-db',
				cache: new Map(),
			}),
			schema: {
				output: z.string(),
			},
			handler: async (ctx) => {
				return (ctx.config as TestConfig).database;
			},
		});

		const ctx = new TestAgentContext<TestConfig>({
			config: { database: 'mock-db', cache: new Map() },
		});

		const result = await runInAgentContext(ctx, agent);
		expect(result).toBe('mock-db');
	});

	test('agent can access app state', async () => {
		type TestAppState = { version: string };

		const agent = createAgent('app-state-test', {
			schema: {
				output: z.string(),
			},
			handler: async (ctx) => {
				return (ctx.app as TestAppState).version;
			},
		});

		const ctx = new TestAgentContext<unknown, TestAppState>({
			app: { version: '1.0.0' },
		});

		const result = await runInAgentContext(ctx, agent);
		expect(result).toBe('1.0.0');
	});
});

describe('Agent WaitUntil', () => {
	test('agent can schedule background task', async () => {
		let backgroundTaskRan = false;

		const agent = createAgent('waituntil-test', {
			handler: async (ctx) => {
				ctx.waitUntil(async () => {
					// Simulate async work
					await new Promise((resolve) => setTimeout(resolve, 10));
					backgroundTaskRan = true;
				});
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent);

		expect(result).toBeUndefined(); // Agent has no output schema
		expect(backgroundTaskRan).toBe(false); // Not yet

		// Wait for background tasks
		await ctx.waitForBackgroundTasks();
		expect(backgroundTaskRan).toBe(true);
	});
});

describe('Agent Error Handling', () => {
	test('agent throws error from handler', async () => {
		const agent = createAgent('error-test', {
			handler: async (_ctx) => {
				throw new Error('Test error');
			},
		});

		const ctx = new TestAgentContext();
		expect(async () => await runInAgentContext(ctx, agent)).toThrow('Test error');
	});

	test('agent validation error on invalid input', async () => {
		const agent = createAgent('validation-test', {
			schema: {
				input: z.object({ age: z.number().min(0) }),
				output: z.string(),
			},
			handler: async (_ctx, input) => `Age: ${input.age}`,
		});

		const ctx = new TestAgentContext();
		// Invalid input should throw validation error
		const invalidInput = { age: -1 };
		expect(async () => await runInAgentContext(ctx, agent, invalidInput)).toThrow();
	});
});

describe('Streaming Agents', () => {
	test('agent can return ReadableStream', async () => {
		const agent = createAgent('stream-agent', {
			schema: {
				input: z.string(),
				output: z.string(),
				stream: true,
			},
			handler: async (ctx, input) => {
				return new ReadableStream<string>({
					start(controller) {
						controller.enqueue(`Hello ${input}`);
						controller.enqueue('World');
						controller.close();
					},
				});
			},
		});

		const ctx = new TestAgentContext();
		const stream = await runInAgentContext<string, ReadableStream<string>>(ctx, agent, 'Test');
		expect(stream).toBeInstanceOf(ReadableStream);

		// Read stream chunks
		const reader = stream.getReader();
		const chunks: string[] = [];
		let done = false;

		while (!done) {
			const { value, done: readerDone } = await reader.read();
			done = readerDone;
			if (value !== undefined) {
				chunks.push(value);
			}
		}

		expect(chunks).toEqual(['Hello Test', 'World']);
	});
});

describe('Agent Metadata', () => {
	test('agent has metadata', () => {
		const agent = createAgent('metadata-test', {
			description: 'Test agent description',
			handler: async (_ctx) => {},
		});

		expect(agent.metadata).toBeDefined();
		expect(agent.metadata.name).toBe('metadata-test');
	});

	test('agent metadata includes description', () => {
		const agent = createAgent('described-agent', {
			description: 'This is a test description',
			handler: async (_ctx) => {},
		});

		expect(agent.metadata.description).toBe('This is a test description');
	});
});
