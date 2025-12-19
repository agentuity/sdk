/**
 * Unit tests for OpenTelemetry span and log attributes.
 * Verifies that agent metadata and thread ID are correctly set on logger context.
 */

import { test, expect, describe } from 'bun:test';
import { createAgent, runInAgentContext } from '../src/agent';
import { z } from 'zod';
import { TestAgentContext } from './helpers/test-context';
import type { Logger } from '../src/logger';

// Track logger.child() calls to verify attributes
function createLoggerWithChildTracking(): {
	logger: Logger;
	childCalls: Record<string, unknown>[];
} {
	const childCalls: Record<string, unknown>[] = [];
	const noop = () => {};

	const createLogger = (attrs?: Record<string, unknown>): Logger => {
		if (attrs) {
			childCalls.push(attrs);
		}
		return {
			trace: noop,
			debug: noop,
			info: noop,
			warn: noop,
			error: noop,
			fatal: (() => {
				throw new Error('fatal');
			}) as Logger['fatal'],
			child: (opts: Record<string, unknown>) => createLogger(opts),
		};
	};

	return { logger: createLogger(), childCalls };
}

describe('OpenTelemetry Attributes', () => {
	describe('Logger Attributes', () => {
		test('logger.child() is called with @agentuity/threadId', async () => {
			const { logger, childCalls } = createLoggerWithChildTracking();

			const agent = createAgent('test-agent', {
				schema: {
					input: z.object({ value: z.string() }),
					output: z.string(),
				},
				handler: async (ctx, input) => {
					return `processed: ${input.value}`;
				},
			});

			const ctx = new TestAgentContext({ logger });
			ctx.thread.id = 'test-thread-123';
			await runInAgentContext(ctx, agent, { value: 'test' });

			// Agent execution calls logger.child() with attributes
			expect(childCalls.length).toBeGreaterThan(0);

			const attrs = childCalls[0];
			expect(attrs['@agentuity/threadId']).toBe('test-thread-123');
		});

		test('logger.child() is called with @agentuity/agentId', async () => {
			const { logger, childCalls } = createLoggerWithChildTracking();

			const agent = createAgent('test-agent', {
				schema: {
					output: z.string(),
				},
				handler: async () => {
					return 'done';
				},
			});

			const ctx = new TestAgentContext({ logger });
			await runInAgentContext(ctx, agent);

			expect(childCalls.length).toBeGreaterThan(0);

			const attrs = childCalls[0];
			expect(attrs['@agentuity/agentId']).toBeDefined();
			expect(attrs['@agentuity/agentName']).toBe('test-agent');
		});

		test('logger.child() receives all agent metadata attributes', async () => {
			const { logger, childCalls } = createLoggerWithChildTracking();

			const agent = createAgent('metadata-test', {
				description: 'Test agent for metadata verification',
				schema: {
					output: z.string(),
				},
				handler: async () => {
					return 'done';
				},
			});

			const ctx = new TestAgentContext({ logger });
			ctx.thread.id = 'metadata-thread';
			await runInAgentContext(ctx, agent);

			expect(childCalls.length).toBeGreaterThan(0);

			const attrs = childCalls[0];

			// Verify all expected attributes are passed to logger.child()
			expect(attrs['@agentuity/agentId']).toBeDefined();
			expect(attrs['@agentuity/agentInstanceId']).toBeDefined();
			expect(attrs['@agentuity/agentDescription']).toBe('Test agent for metadata verification');
			expect(attrs['@agentuity/agentName']).toBe('metadata-test');
			expect(attrs['@agentuity/threadId']).toBe('metadata-thread');
		});

		test('different threads have different threadId in logger attributes', async () => {
			const tracking1 = createLoggerWithChildTracking();
			const tracking2 = createLoggerWithChildTracking();

			const agent = createAgent('thread-test', {
				schema: {
					output: z.string(),
				},
				handler: async () => {
					return 'done';
				},
			});

			// Run with first thread
			const ctx1 = new TestAgentContext({ logger: tracking1.logger });
			ctx1.thread.id = 'thread-1';
			await runInAgentContext(ctx1, agent);

			// Run with second thread
			const ctx2 = new TestAgentContext({ logger: tracking2.logger });
			ctx2.thread.id = 'thread-2';
			await runInAgentContext(ctx2, agent);

			expect(tracking1.childCalls.length).toBeGreaterThan(0);
			expect(tracking2.childCalls.length).toBeGreaterThan(0);

			const attrs1 = tracking1.childCalls[0];
			const attrs2 = tracking2.childCalls[0];

			expect(attrs1['@agentuity/threadId']).toBe('thread-1');
			expect(attrs2['@agentuity/threadId']).toBe('thread-2');
		});

		test('threadId attribute matches context thread.id', async () => {
			const { logger, childCalls } = createLoggerWithChildTracking();

			const agent = createAgent('match-test', {
				handler: async (ctx) => {
					// Verify context has thread
					expect(ctx.thread.id).toBe('verification-thread-xyz');
				},
			});

			const ctx = new TestAgentContext({ logger });
			ctx.thread.id = 'verification-thread-xyz';
			await runInAgentContext(ctx, agent);

			expect(childCalls.length).toBeGreaterThan(0);

			const attrs = childCalls[0];
			expect(attrs['@agentuity/threadId']).toBe('verification-thread-xyz');
		});
	});
});
