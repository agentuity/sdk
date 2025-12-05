/**
 * Unit tests for agent and app event system.
 * Tests event listeners, event firing, and event propagation.
 */

import { test, expect, describe } from 'bun:test';
import { createAgent, runInAgentContext } from '../src/agent';
import { TestAgentContext } from './helpers/test-context';

describe('Agent Event Listeners', () => {
	test('agent fires started event', async () => {
		let startedFired = false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let capturedAgent: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let capturedContext: any;

		const agent = createAgent('event-test', {
			handler: async (_ctx) => {},
		});

		agent.addEventListener('started', (eventName, ag, ctx) => {
			startedFired = true;
			capturedAgent = ag;
			capturedContext = ctx;
			expect(eventName).toBe('started');
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);

		expect(startedFired).toBe(true);
		expect(capturedAgent).toBeDefined();
		expect(capturedContext).toBeDefined();
	});

	test('agent fires completed event', async () => {
		let completedFired = false;

		const agent = createAgent('event-test', {
			handler: async (_ctx) => {},
		});

		agent.addEventListener('completed', (eventName, _ag, _ctx) => {
			completedFired = true;
			expect(eventName).toBe('completed');
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);

		expect(completedFired).toBe(true);
	});

	test('agent fires errored event', async () => {
		let erroredFired = false;
		let capturedError: Error | undefined;

		const agent = createAgent('error-test', {
			handler: async (_ctx) => {
				throw new Error('Test error');
			},
		});

		agent.addEventListener('errored', (eventName, _ag, _ctx, error) => {
			erroredFired = true;
			capturedError = error;
			expect(eventName).toBe('errored');
		});

		const ctx = new TestAgentContext();

		try {
			await runInAgentContext(ctx, agent);
		} catch (_e) {
			// Expected to throw
		}

		expect(erroredFired).toBe(true);
		expect(capturedError).toBeDefined();
		expect(capturedError?.message).toBe('Test error');
	});

	test('multiple event listeners fire in order', async () => {
		const executionOrder: number[] = [];

		const agent = createAgent('multi-listener', {
			handler: async (_ctx) => {},
		});

		agent.addEventListener('started', (_eventName, _ag, _ctx) => {
			executionOrder.push(1);
		});

		agent.addEventListener('started', (_eventName, _ag, _ctx) => {
			executionOrder.push(2);
		});

		agent.addEventListener('completed', (_eventName, _ag, _ctx) => {
			executionOrder.push(3);
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);

		expect(executionOrder).toEqual([1, 2, 3]);
	});

	test('removeEventListener removes specific callback', async () => {
		let callback1Fired = false;
		let callback2Fired = false;

		const agent = createAgent('remove-test', {
			handler: async (_ctx) => {},
		});

		const callback1 = (_eventName: string, _ag: unknown, _ctx: unknown) => {
			callback1Fired = true;
		};

		const callback2 = (_eventName: string, _ag: unknown, _ctx: unknown) => {
			callback2Fired = true;
		};

		agent.addEventListener('started', callback1);
		agent.addEventListener('started', callback2);
		agent.removeEventListener('started', callback1);

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);

		expect(callback1Fired).toBe(false); // Removed, should not fire
		expect(callback2Fired).toBe(true); // Still registered
	});

	test('event listener can be async', async () => {
		let asyncCompleted = false;

		const agent = createAgent('async-listener', {
			handler: async (_ctx) => {},
		});

		agent.addEventListener('completed', async (_eventName, _ag, _ctx) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			asyncCompleted = true;
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);

		expect(asyncCompleted).toBe(true);
	});
});

describe('Event Listener Context Access', () => {
	test('started event receives correct context', async () => {
		let receivedSessionId: string | undefined;
		let receivedAgentMetadata: { name?: string } | undefined;

		const agent = createAgent('context-test', {
			handler: async (_ctx) => {},
		});

		agent.addEventListener('started', (_eventName, ag, ctx) => {
			receivedSessionId = ctx.sessionId;
			receivedAgentMetadata = ag.metadata;
		});

		const ctx = new TestAgentContext({
			sessionId: 'test-session-123',
		});
		await runInAgentContext(ctx, agent);

		expect(receivedSessionId).toBe('test-session-123');
		expect(receivedAgentMetadata?.name).toBe('context-test'); // Get name from agent metadata
	});

	test('event listener can access agent metadata', async () => {
		let agentName: string | undefined;

		const agent = createAgent('metadata-test', {
			description: 'Test description',
			handler: async (_ctx) => {},
		});

		agent.addEventListener('completed', (_eventName, ag, _ctx) => {
			agentName = ag.metadata.name;
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);

		expect(agentName).toBe('metadata-test');
	});
});

describe('Event Error Handling', () => {
	test('error in started listener propagates', async () => {
		const agent = createAgent('error-listener', {
			handler: async (_ctx) => {},
		});

		agent.addEventListener('started', (_eventName, _ag, _ctx) => {
			throw new Error('Listener error');
		});

		const ctx = new TestAgentContext();

		await expect(async () => {
			await runInAgentContext(ctx, agent);
		}).toThrow('Listener error');
	});

	test('error in completed listener propagates', async () => {
		const agent = createAgent('error-listener', {
			handler: async (_ctx) => {},
		});

		agent.addEventListener('completed', (_eventName, _ag, _ctx) => {
			throw new Error('Listener error');
		});

		const ctx = new TestAgentContext();

		await expect(async () => {
			await runInAgentContext(ctx, agent);
		}).toThrow('Listener error');
	});
});

describe('Event Execution Order', () => {
	test('started fires before handler, completed fires after', async () => {
		const executionOrder: string[] = [];

		const agent = createAgent('order-test', {
			handler: async (_ctx) => {
				executionOrder.push('handler');
			},
		});

		agent.addEventListener('started', (_eventName, _ag, _ctx) => {
			executionOrder.push('started');
		});

		agent.addEventListener('completed', (_eventName, _ag, _ctx) => {
			executionOrder.push('completed');
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);

		expect(executionOrder).toEqual(['started', 'handler', 'completed']);
	});

	test('errored fires instead of completed on error', async () => {
		const events: string[] = [];

		const agent = createAgent('error-order', {
			handler: async (_ctx) => {
				events.push('handler');
				throw new Error('Handler error');
			},
		});

		agent.addEventListener('started', (_eventName, _ag, _ctx) => {
			events.push('started');
		});

		agent.addEventListener('completed', (_eventName, _ag, _ctx) => {
			events.push('completed');
		});

		agent.addEventListener('errored', (_eventName, _ag, _ctx, _error) => {
			events.push('errored');
		});

		const ctx = new TestAgentContext();

		try {
			await runInAgentContext(ctx, agent);
		} catch (_e) {
			// Expected
		}

		expect(events).toEqual(['started', 'handler', 'errored']);
		expect(events).not.toContain('completed');
	});
});
