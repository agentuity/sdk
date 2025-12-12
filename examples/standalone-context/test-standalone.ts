#!/usr/bin/env bun

/**
 * Test script for standalone agent context execution.
 *
 * This demonstrates how to run agents outside of HTTP request contexts,
 * such as in Discord bots, cron jobs, or WebSocket callbacks.
 */

import { createAgentContext } from '@agentuity/runtime';
import { app } from './app';
import greetingAgent from './agents/greeting';

console.log('🚀 Starting standalone context test...\n');

// Wait for app initialization
await new Promise((resolve) => setTimeout(resolve, 100));

console.log('📦 App state initialized:', app.state);
console.log('');

// Example 1: Simple one-off execution
console.log('Example 1: Simple one-off execution');
console.log('=====================================');
{
	const ctx = createAgentContext();
	const result = await ctx.invoke(() => greetingAgent.run({ name: 'Alice' }));
	console.log('Result:', result);
	console.log('');
}

// Example 2: Reuse context for multiple calls
console.log('Example 2: Reuse context for multiple calls');
console.log('============================================');
{
	const ctx = createAgentContext({ trigger: 'manual' });

	const result1 = await ctx.invoke(() => greetingAgent.run({ name: 'Bob' }));
	console.log('Result 1:', result1);

	const result2 = await ctx.invoke(() => greetingAgent.run({ name: 'Charlie' }));
	console.log('Result 2:', result2);
	console.log('');
}

// Example 3: Custom session ID (e.g., from Discord message)
console.log('Example 3: Custom session ID (Discord bot simulation)');
console.log('======================================================');
{
	const discordMessageId = 'discord-msg-12345';
	const ctx = createAgentContext({
		sessionId: discordMessageId,
		trigger: 'discord',
	});

	const result = await ctx.invoke(() => greetingAgent.run({ name: 'Discord User' }));
	console.log('Result:', result);
	console.log('Session ID:', ctx.sessionId);
	console.log('');
}

// Example 4: Sequence of agents (simulating a workflow)
console.log('Example 4: Multiple agents in sequence');
console.log('=======================================');
{
	const ctx = createAgentContext({ trigger: 'cron' });

	const result = await ctx.invoke(async () => {
		// First agent call
		const greeting = await greetingAgent.run({ name: 'Workflow User' });
		console.log('  Step 1 complete:', greeting.message);

		// Could call another agent here with greeting result
		// For now, just return the greeting
		return greeting;
	});

	console.log('Final result:', result);
	console.log('');
}

console.log('✅ All examples completed successfully!');

// Gracefully shutdown
process.exit(0);
