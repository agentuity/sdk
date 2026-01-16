import { describe, test, expect, beforeEach } from 'bun:test';
import { createAgent, runInAgentContext } from '../../src/agent';
import { TestAgentContext } from '../helpers/test-context';

/**
 * Unit tests for ctx.waitUntil() lifecycle functionality
 *
 * These tests verify that background tasks can be scheduled and executed
 * after the main agent response is sent.
 */
describe('waitUntil Background Tasks', () => {
	let ctx: TestAgentContext;

	beforeEach(() => {
		ctx = new TestAgentContext();
	});

	test('schedules basic async background task', async () => {
		let taskExecuted = false;

		const agent = createAgent('basic-waituntil', {
			handler: async (ctx) => {
				ctx.waitUntil(async () => {
					await new Promise((resolve) => setTimeout(resolve, 50));
					taskExecuted = true;
				});
			},
		});

		await runInAgentContext(ctx, agent);

		// Task should not execute immediately
		expect(taskExecuted).toBe(false);

		// Wait for background tasks to complete
		await ctx.waitForBackgroundTasks();
		expect(taskExecuted).toBe(true);
	});

	test('schedules multiple background tasks', async () => {
		const executionOrder: number[] = [];

		const agent = createAgent('multiple-waituntil', {
			handler: async (ctx) => {
				// Schedule 5 background tasks
				for (let i = 0; i < 5; i++) {
					ctx.waitUntil(async () => {
						await new Promise((resolve) => setTimeout(resolve, 50));
						executionOrder.push(i);
					});
				}
			},
		});

		await runInAgentContext(ctx, agent);
		expect(executionOrder).toEqual([]);

		await ctx.waitForBackgroundTasks();
		expect(executionOrder.length).toBe(5);
		expect(executionOrder).toContain(0);
		expect(executionOrder).toContain(4);
	});

	test('handles background task errors', async () => {
		let mainRequestCompleted = false;

		const agent = createAgent('error-waituntil', {
			handler: async (ctx) => {
				ctx.waitUntil(async () => {
					throw new Error('Background task failure');
				});

				mainRequestCompleted = true;
			},
		});

		// Main request should succeed
		await runInAgentContext(ctx, agent);
		expect(mainRequestCompleted).toBe(true);

		// In test environment, background task errors will throw when awaited
		// (In production, they're caught and logged)
		await expect(ctx.waitForBackgroundTasks()).rejects.toThrow('Background task failure');
	});

	test('supports promise-based tasks', async () => {
		let promiseTaskExecuted = false;

		const agent = createAgent('promise-waituntil', {
			handler: async (ctx) => {
				ctx.waitUntil(
					new Promise<void>((resolve) => {
						setTimeout(() => {
							promiseTaskExecuted = true;
							resolve();
						}, 50);
					})
				);
			},
		});

		await runInAgentContext(ctx, agent);
		expect(promiseTaskExecuted).toBe(false);

		await ctx.waitForBackgroundTasks();
		expect(promiseTaskExecuted).toBe(true);
	});

	test('supports synchronous function tasks', async () => {
		let syncTaskExecuted = false;

		const agent = createAgent('sync-waituntil', {
			handler: async (ctx) => {
				ctx.waitUntil(() => {
					syncTaskExecuted = true;
				});
			},
		});

		await runInAgentContext(ctx, agent);

		// In test context, sync functions execute immediately
		// (In production runtime, they're also executed synchronously)
		expect(syncTaskExecuted).toBe(true);
	});

	test('executes tasks in order of registration', async () => {
		const executionOrder: string[] = [];

		const agent = createAgent('ordered-waituntil', {
			handler: async (ctx) => {
				ctx.waitUntil(() => executionOrder.push('first'));
				ctx.waitUntil(() => executionOrder.push('second'));
				ctx.waitUntil(() => executionOrder.push('third'));
			},
		});

		await runInAgentContext(ctx, agent);
		await ctx.waitForBackgroundTasks();

		expect(executionOrder).toEqual(['first', 'second', 'third']);
	});

	test('allows access to context in background tasks', async () => {
		let sessionId: string | undefined;
		let threadId: string | undefined;

		const agent = createAgent('context-waituntil', {
			handler: async (ctx) => {
				ctx.waitUntil(() => {
					sessionId = ctx.session.id;
					threadId = ctx.thread.id;
				});
			},
		});

		await runInAgentContext(ctx, agent);
		await ctx.waitForBackgroundTasks();

		// Test context uses mock IDs
		expect(sessionId).toBeDefined();
		expect(threadId).toBeDefined();
		expect(sessionId).toBe('test-session');
		expect(threadId).toBe('test-thread');
	});

	test('supports nested waitUntil calls', async () => {
		const executionLog: string[] = [];

		const agent = createAgent('nested-waituntil', {
			handler: async (ctx) => {
				ctx.waitUntil(async () => {
					executionLog.push('outer-start');

					ctx.waitUntil(() => {
						executionLog.push('inner');
					});

					executionLog.push('outer-end');
				});
			},
		});

		await runInAgentContext(ctx, agent);
		await ctx.waitForBackgroundTasks();

		expect(executionLog).toContain('outer-start');
		expect(executionLog).toContain('outer-end');
		expect(executionLog).toContain('inner');
	});
});
