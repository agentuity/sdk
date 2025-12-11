import { describe, test, expect, beforeAll } from 'bun:test';
import { createAgentContext } from '@agentuity/runtime';
import { app } from '../app';
import greetingAgent from '../agents/greeting';

describe('Standalone Context Example', () => {
	beforeAll(async () => {
		// Wait for app to be ready
		await app.ready();
		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	test('Example 1: Simple one-off execution', async () => {
		const ctx = createAgentContext();
		const result = await ctx.invoke(() => greetingAgent.run({ name: 'Alice' }));

		expect(result).toBeDefined();
		expect(result.message).toContain('Hello, Alice!');
		expect(result.message).toContain('visitor');
		expect(result.timestamp).toBeGreaterThan(0);
	});

	test('Example 2: Reuse context for multiple calls', async () => {
		const ctx = createAgentContext({ trigger: 'manual' });

		const result1 = await ctx.invoke(() => greetingAgent.run({ name: 'Bob' }));
		expect(result1.message).toContain('Hello, Bob!');

		const result2 = await ctx.invoke(() => greetingAgent.run({ name: 'Charlie' }));
		expect(result2.message).toContain('Hello, Charlie!');

		// Visitor count should increase
		const visitor1 = parseInt(result1.message.match(/#(\d+)/)?.[1] ?? '0');
		const visitor2 = parseInt(result2.message.match(/#(\d+)/)?.[1] ?? '0');
		expect(visitor2).toBeGreaterThan(visitor1);
	});

	test('Example 3: Custom session ID (Discord bot simulation)', async () => {
		const discordMessageId = 'discord-msg-12345';
		const ctx = createAgentContext({
			sessionId: discordMessageId,
			trigger: 'discord',
		});

		const result = await ctx.invoke(() => greetingAgent.run({ name: 'Discord User' }));

		expect(result.message).toContain('Hello, Discord User!');
		expect(ctx.sessionId).toBe(discordMessageId);
	});

	test('Example 4: Multiple agents in sequence', async () => {
		const ctx = createAgentContext({ trigger: 'cron' });

		const result = await ctx.invoke(async () => {
			// First agent call
			const greeting = await greetingAgent.run({ name: 'Workflow User' });
			expect(greeting.message).toContain('Hello, Workflow User!');

			// Could call another agent here with greeting result
			return greeting;
		});

		expect(result.message).toContain('Hello, Workflow User!');
	});

	test('Agent uses KV storage', async () => {
		const ctx = createAgentContext();

		// First call
		const result1 = await ctx.invoke(() => greetingAgent.run({ name: 'KV Test' }));
		const count1 = parseInt(result1.message.match(/#(\d+)/)?.[1] ?? '0');

		// Second call should increment count
		const result2 = await ctx.invoke(() => greetingAgent.run({ name: 'KV Test 2' }));
		const count2 = parseInt(result2.message.match(/#(\d+)/)?.[1] ?? '0');

		expect(count2).toBe(count1 + 1);
	});

	test('Agent has access to app state', async () => {
		const ctx = createAgentContext();

		await ctx.invoke(async () => {
			// The greeting agent logs app.name
			// We can't directly access the log output, but we can verify the agent runs successfully
			const result = await greetingAgent.run({ name: 'App State Test' });
			expect(result).toBeDefined();

			// Verify app state is accessible
			expect(ctx.app.name).toBe('Standalone Context Example');
			expect(ctx.app.startTime).toBeGreaterThan(0);

			return result;
		});
	});

	test('Background tasks execute via waitUntil', async () => {
		const ctx = createAgentContext();

		// The greeting agent schedules a background task
		const result = await ctx.invoke(() => greetingAgent.run({ name: 'Background Test' }));

		expect(result).toBeDefined();

		// Wait for background tasks to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Background task should have logged (can't verify logs directly, but shouldn't error)
	});

	test('Context can be used for different triggers', async () => {
		const triggers: Array<'discord' | 'cron' | 'websocket' | 'manual'> = [
			'discord',
			'cron',
			'websocket',
			'manual',
		];

		for (const trigger of triggers) {
			const ctx = createAgentContext({ trigger });
			const result = await ctx.invoke(() => greetingAgent.run({ name: `${trigger} user` }));

			expect(result).toBeDefined();
			expect(result.message).toContain(`Hello, ${trigger} user!`);
		}
	});

	test('Multiple contexts run independently', async () => {
		const ctx1 = createAgentContext({ sessionId: 'session-1' });
		const ctx2 = createAgentContext({ sessionId: 'session-2' });

		const [result1, result2] = await Promise.all([
			ctx1.invoke(() => greetingAgent.run({ name: 'Concurrent 1' })),
			ctx2.invoke(() => greetingAgent.run({ name: 'Concurrent 2' })),
		]);

		expect(result1.message).toContain('Concurrent 1');
		expect(result2.message).toContain('Concurrent 2');
		expect(ctx1.sessionId).toBe('session-1');
		expect(ctx2.sessionId).toBe('session-2');
	});
});
