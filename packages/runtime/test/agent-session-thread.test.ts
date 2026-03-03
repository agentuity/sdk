/**
 * Tests for agent.run() receiving session and thread from route context.
 * Validates that middleware ordering ensures session/thread are available in agent context.
 */

import { test, expect, describe } from 'bun:test';
import { createAgent, runInAgentContext } from '../src/agent';
import { z } from 'zod';
import { TestAgentContext } from './helpers/test-context';

describe('Agent Session and Thread Context', () => {
	test('agent receives session and thread from context', async () => {
		// Track what the agent receives
		let receivedSessionId: string | undefined;
		let receivedThreadId: string | undefined;
		let receivedSession: unknown;
		let receivedThread: unknown;

		const agent = createAgent('session-test', {
			schema: {
				input: z.object({ message: z.string() }),
				output: z.object({ sessionId: z.string(), threadId: z.string() }),
			},
			handler: async (ctx, _input) => {
				// Capture what the agent context has
				receivedSessionId = ctx.sessionId;
				receivedSession = ctx.session;
				receivedThread = ctx.thread;
				receivedThreadId = ctx.thread?.id;

				return {
					sessionId: ctx.sessionId || 'undefined',
					threadId: ctx.thread?.id || 'undefined',
				};
			},
		});

		// Create a context with session and thread
		const ctx = new TestAgentContext({
			sessionId: 'test-session-123',
		});

		// Run the agent
		const result = await runInAgentContext(ctx, agent, { message: 'hello' });

		// Verify agent received session and thread
		expect(receivedSessionId).toBe('test-session-123');
		expect(receivedSession).toBeDefined();
		expect(receivedThread).toBeDefined();
		expect(receivedThreadId).toBeDefined();

		// Verify the response
		expect(result.sessionId).toBe('test-session-123');
		expect(result.threadId).toBe(receivedThreadId);
		expect(result.sessionId).not.toBe('undefined');
		expect(result.threadId).not.toBe('undefined');
	});

	test('multiple agent calls share the same session and thread', async () => {
		const sessionIds = new Set<string>();
		const threadIds = new Set<string>();

		const agent1 = createAgent('agent-one', {
			schema: {
				output: z.object({ sessionId: z.string(), threadId: z.string() }),
			},
			handler: async (ctx) => {
				sessionIds.add(ctx.sessionId);
				threadIds.add(ctx.thread?.id || '');
				return {
					sessionId: ctx.sessionId,
					threadId: ctx.thread?.id || '',
				};
			},
		});

		const agent2 = createAgent('agent-two', {
			schema: {
				output: z.object({ sessionId: z.string(), threadId: z.string() }),
			},
			handler: async (ctx) => {
				sessionIds.add(ctx.sessionId);
				threadIds.add(ctx.thread?.id || '');
				return {
					sessionId: ctx.sessionId,
					threadId: ctx.thread?.id || '',
				};
			},
		});

		// Create shared context
		const ctx = new TestAgentContext({
			sessionId: 'shared-session',
		});

		// Run both agents with same context
		const result1 = await runInAgentContext(ctx, agent1);
		const result2 = await runInAgentContext(ctx, agent2);

		// All agents with same context should share session/thread
		expect(sessionIds.size).toBe(1);
		expect(threadIds.size).toBe(1);
		expect(result1.sessionId).toBe(result2.sessionId);
		expect(result1.threadId).toBe(result2.threadId);
	});

	test('agent can access session state', async () => {
		const agent = createAgent('session-state', {
			schema: {
				input: z.object({ key: z.string(), value: z.string() }),
				output: z.object({ stored: z.boolean(), retrieved: z.string().optional() }),
			},
			handler: async (ctx, input) => {
				// Store in session state
				ctx.session.state.set(input.key, input.value);

				// Retrieve from session state
				const retrieved = ctx.session.state.get(input.key) as string | undefined;

				return {
					stored: retrieved === input.value,
					retrieved,
				};
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent, {
			key: 'testKey',
			value: 'testValue',
		});

		expect(result.stored).toBe(true);
		expect(result.retrieved).toBe('testValue');
	});

	test('agent can access thread state', async () => {
		const agent = createAgent('thread-state', {
			schema: {
				input: z.object({ key: z.string(), value: z.number() }),
				output: z.object({ stored: z.boolean(), retrieved: z.number().optional() }),
			},
			handler: async (ctx, input) => {
				// Store in thread state
				ctx.thread.state.set(input.key, input.value);

				// Retrieve from thread state
				const retrieved = ctx.thread.state.get(input.key) as number | undefined;

				return {
					stored: retrieved === input.value,
					retrieved,
				};
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent, {
			key: 'counter',
			value: 42,
		});

		expect(result.stored).toBe(true);
		expect(result.retrieved).toBe(42);
	});

	test('session and thread are distinct objects', async () => {
		const agent = createAgent('state-test', {
			schema: {
				output: z.object({ sessionHasKey: z.boolean(), threadHasKey: z.boolean() }),
			},
			handler: async (ctx) => {
				// Set in session only
				ctx.session.state.set('sessionKey', 'sessionValue');

				// Set in thread only
				ctx.thread.state.set('threadKey', 'threadValue');

				return {
					sessionHasKey: ctx.session.state.has('sessionKey'),
					threadHasKey: ctx.thread.state.has('threadKey'),
				};
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent);

		expect(result.sessionHasKey).toBe(true);
		expect(result.threadHasKey).toBe(true);

		// Verify they're separate
		expect(ctx.session.state.has('sessionKey')).toBe(true);
		expect(ctx.session.state.has('threadKey')).toBe(false);
		expect(ctx.thread.state.has('threadKey')).toBe(true);
		expect(ctx.thread.state.has('sessionKey')).toBe(false);
	});
});
