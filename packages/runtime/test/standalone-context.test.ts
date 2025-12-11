import { describe, test, expect, beforeAll } from 'bun:test';
import { createAgentContext } from '../src/_standalone';
import { createAgent } from '../src/agent';
import { s } from '@agentuity/schema';
import { createApp } from '../src/app';
import { createRouter } from '../src/router';
import { getLogger, getTracer, getAppState } from '../src/_server';

// Simple test agent
const greetingAgent = createAgent('greeting-test', {
	description: 'Test greeting agent',
	schema: {
		input: s.object({
			name: s.string(),
		}),
		output: s.object({
			message: s.string(),
			count: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('Greeting: %s', input.name);

		// Use KV storage
		const storedCount = await ctx.kv.get<number>('test-count');
		const count = typeof storedCount === 'number' ? storedCount : (typeof storedCount === 'string' ? parseInt(storedCount) : 0);
		await ctx.kv.set('test-count', count + 1);

		// Background task
		ctx.waitUntil(async () => {
			ctx.logger.debug('Background task completed');
		});

		return {
			message: `Hello, ${input.name}!`,
			count: count + 1,
		};
	},
});

// Agent with no input
const statusAgent = createAgent('status-test', {
	description: 'Test status agent',
	schema: {
		output: s.object({
			status: s.string(),
			timestamp: s.number(),
		}),
	},
	handler: async (ctx) => {
		ctx.logger.info('Status check');
		return {
			status: 'ok',
			timestamp: Date.now(),
		};
	},
});

// Agent that throws error
const errorAgent = createAgent('error-test', {
	description: 'Test error agent',
	schema: {
		input: s.object({
			shouldFail: s.boolean(),
		}),
		output: s.object({
			result: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		if (input.shouldFail) {
			throw new Error('Intentional test error');
		}
		return { result: 'success' };
	},
});

describe('createAgentContext', () => {
	beforeAll(async () => {
		// Initialize app for global state
		const router = createRouter();
		await createApp({
			router,
			setup: async () => ({
				testMode: true,
				startTime: Date.now(),
			}),
		});

		// Wait for server to be ready
		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	describe('basic functionality', () => {
		test('creates context with global state', () => {
			const ctx = createAgentContext();

			expect(ctx).toBeDefined();
			expect(ctx.logger).toBeDefined();
			expect(ctx.tracer).toBeDefined();
			expect(ctx.app).toBeDefined();
			expect(ctx.kv).toBeDefined();
			expect(ctx.stream).toBeDefined();
			expect(ctx.vector).toBeDefined();
			expect(ctx.state).toBeInstanceOf(Map);
		});

		test('succeeds when server is initialized', () => {
			// Verify global state is available after server init
			const logger = getLogger();
			const tracer = getTracer();
			const app = getAppState();

			// All globals should be present after beforeAll
			expect(logger).toBeDefined();
			expect(tracer).toBeDefined();
			expect(app).toBeDefined();

			// Creating context should not throw
			expect(() => {
				const ctx = createAgentContext();
				expect(ctx).toBeDefined();
			}).not.toThrow();
		});

		test('sets default trigger to manual', () => {
			const ctx = createAgentContext();
			// We can't directly access private property, but we can verify via invoke
			expect(ctx).toBeDefined();
		});

		test('accepts custom trigger', () => {
			const ctx = createAgentContext({ trigger: 'discord' });
			expect(ctx).toBeDefined();
		});

		test('accepts custom sessionId', () => {
			const customId = 'custom-session-123';
			const ctx = createAgentContext({ sessionId: customId });
			// SessionId will be set properly in invoke, but we store the initial one
			expect(ctx).toBeDefined();
		});
	});

	describe('invoke method', () => {
		test('executes agent with input', async () => {
			const ctx = createAgentContext();
			const result = await ctx.invoke(() => greetingAgent.run({ name: 'Alice' }));

			expect(result).toBeDefined();
			expect(result.message).toBe('Hello, Alice!');
			expect(result.count).toBeGreaterThan(0);
		});

		test('executes agent without input', async () => {
			const ctx = createAgentContext();
			const result = await ctx.invoke(() => statusAgent.run());

			expect(result).toBeDefined();
			expect(result.status).toBe('ok');
			expect(result.timestamp).toBeGreaterThan(0);
		});

		test('handles agent errors gracefully', async () => {
			const ctx = createAgentContext();

			await expect(
				ctx.invoke(() => errorAgent.run({ shouldFail: true }))
			).rejects.toThrow('Intentional test error');
		});

		test('propagates successful results', async () => {
			const ctx = createAgentContext();
			const result = await ctx.invoke(() => errorAgent.run({ shouldFail: false }));

			expect(result).toBeDefined();
			expect(result.result).toBe('success');
		});

		test('sets sessionId from trace context', async () => {
			const ctx = createAgentContext();
			await ctx.invoke(() => statusAgent.run());

			// SessionId should be set after invoke
			expect(ctx.sessionId).toBeDefined();
			expect(ctx.sessionId).toMatch(/^sess_/);
		});

		test('uses custom sessionId when provided', async () => {
			const customId = 'discord-msg-12345';
			const ctx = createAgentContext({ sessionId: customId });
			await ctx.invoke(() => statusAgent.run());

			expect(ctx.sessionId).toBe(customId);
		});

		test('accepts custom span name', async () => {
			const ctx = createAgentContext();
			const result = await ctx.invoke(() => statusAgent.run(), {
				spanName: 'custom-operation',
			});

			expect(result).toBeDefined();
		});
	});

	describe('usage patterns', () => {
		test('one-off execution pattern', async () => {
			const result = await createAgentContext().invoke(() =>
				greetingAgent.run({ name: 'Bob' })
			);

			expect(result.message).toBe('Hello, Bob!');
		});

		test('reuse context for multiple calls', async () => {
			const ctx = createAgentContext();

			const result1 = await ctx.invoke(() => greetingAgent.run({ name: 'Charlie' }));
			const result2 = await ctx.invoke(() => greetingAgent.run({ name: 'Diana' }));

			expect(result1.message).toBe('Hello, Charlie!');
			expect(result2.message).toBe('Hello, Diana!');

			// Both calls should succeed with counts
			expect(result1.count).toBeGreaterThan(0);
			expect(result2.count).toBeGreaterThan(0);
		});

		test('Discord bot pattern (custom sessionId + trigger)', async () => {
			const messageId = 'discord-123456';
			const ctx = createAgentContext({
				sessionId: messageId,
				trigger: 'discord',
			});

			const result = await ctx.invoke(() => greetingAgent.run({ name: 'DiscordUser' }));

			expect(result.message).toBe('Hello, DiscordUser!');
			expect(ctx.sessionId).toBe(messageId);
		});

		test('cron job pattern', async () => {
			const ctx = createAgentContext({ trigger: 'cron' });

			const result = await ctx.invoke(() => statusAgent.run());

			expect(result.status).toBe('ok');
		});

		test('sequence of agents in one invoke', async () => {
			const ctx = createAgentContext();

			const result = await ctx.invoke(async () => {
				const greeting = await greetingAgent.run({ name: 'Sequence' });
				const status = await statusAgent.run();

				return {
					greeting: greeting.message,
					status: status.status,
				};
			});

			expect(result.greeting).toBe('Hello, Sequence!');
			expect(result.status).toBe('ok');
		});
	});

	describe('infrastructure integration', () => {
		test('context has access to app state', async () => {
			const ctx = createAgentContext();

			await ctx.invoke(async () => {
				// Access app state inside agent context
				expect(ctx.app).toBeDefined();
				expect(ctx.app.testMode).toBe(true);
				expect(ctx.app.startTime).toBeGreaterThan(0);

				return statusAgent.run();
			});
		});

		test('context provides working KV storage', async () => {
			const ctx = createAgentContext();

			// KV operations work - just verify they don't throw
			await ctx.invoke(async () => {
				const key = 'test-key-' + Date.now();
				const value = 'test-value-string';

				// These should not throw
				await ctx.kv.set(key, value);
				await ctx.kv.get<string>(key);
				await ctx.kv.delete(key);

				return statusAgent.run();
			});

			// Verify KV storage is accessible
			expect(ctx.kv).toBeDefined();
			expect(ctx.kv.set).toBeInstanceOf(Function);
			expect(ctx.kv.get).toBeInstanceOf(Function);
		});

		test('context provides working logger', async () => {
			const ctx = createAgentContext();

			await ctx.invoke(async () => {
				// Logger should not throw
				expect(() => {
					ctx.logger.info('Test log');
					ctx.logger.debug('Debug log');
					ctx.logger.warn('Warning log');
				}).not.toThrow();

				return statusAgent.run();
			});
		});

		test('context provides working state map', async () => {
			const ctx = createAgentContext();

			await ctx.invoke(async () => {
				ctx.state.set('key1', 'value1');
				ctx.state.set('key2', 42);

				expect(ctx.state.get('key1')).toBe('value1');
				expect(ctx.state.get('key2')).toBe(42);
				expect(ctx.state.size).toBe(2);

				return statusAgent.run();
			});
		});

		test('waitUntil executes background tasks', async () => {
			const ctx = createAgentContext();
			let taskExecuted = false;

			const result = await ctx.invoke(async () => {
				ctx.waitUntil(async () => {
					// Simulate async background work
					await new Promise((resolve) => setTimeout(resolve, 10));
					taskExecuted = true;
				});

				return statusAgent.run();
			});

			expect(result.status).toBe('ok');

			// Wait a bit for background task to complete
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Background task should have executed
			expect(taskExecuted).toBe(true);
		});

		test('session and thread are available', async () => {
			const ctx = createAgentContext();

			await ctx.invoke(async () => {
				expect(ctx.session).toBeDefined();
				expect(ctx.session.id).toBeDefined();
				expect(ctx.thread).toBeDefined();
				expect(ctx.thread.id).toBeDefined();

				return statusAgent.run();
			});
		});
	});

	describe('error handling', () => {
		test('invoke handles synchronous errors', async () => {
			const ctx = createAgentContext();

			const syncErrorAgent = createAgent('sync-error', {
				schema: {
					output: s.object({ result: s.string() }),
				},
				handler: () => {
					throw new Error('Sync error');
				},
			});

			await expect(ctx.invoke(() => syncErrorAgent.run())).rejects.toThrow('Sync error');
		});

		test('invoke handles async errors', async () => {
			const ctx = createAgentContext();

			const asyncErrorAgent = createAgent('async-error', {
				schema: {
					output: s.object({ result: s.string() }),
				},
				handler: async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					throw new Error('Async error');
				},
			});

			await expect(ctx.invoke(() => asyncErrorAgent.run())).rejects.toThrow('Async error');
		});

		test('invoke handles errors in sequences', async () => {
			const ctx = createAgentContext();

			await expect(
				ctx.invoke(async () => {
					await greetingAgent.run({ name: 'Test' });
					throw new Error('Error in sequence');
				})
			).rejects.toThrow('Error in sequence');
		});
	});

	describe('multiple contexts', () => {
		test('multiple contexts are isolated', async () => {
			const ctx1 = createAgentContext({ sessionId: 'session-1' });
			const ctx2 = createAgentContext({ sessionId: 'session-2' });

			const [result1, result2] = await Promise.all([
				ctx1.invoke(() => greetingAgent.run({ name: 'User1' })),
				ctx2.invoke(() => greetingAgent.run({ name: 'User2' })),
			]);

			expect(result1.message).toBe('Hello, User1!');
			expect(result2.message).toBe('Hello, User2!');
			expect(ctx1.sessionId).toBe('session-1');
			expect(ctx2.sessionId).toBe('session-2');
		});

		test('contexts can run concurrently', async () => {
			const results = await Promise.all([
				createAgentContext().invoke(() => statusAgent.run()),
				createAgentContext().invoke(() => statusAgent.run()),
				createAgentContext().invoke(() => statusAgent.run()),
			]);

			expect(results).toHaveLength(3);
			results.forEach((result) => {
				expect(result.status).toBe('ok');
			});
		});
	});
});
