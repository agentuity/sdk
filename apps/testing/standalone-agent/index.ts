/**
 * Standalone Agent Test
 *
 * Tests that createAgentContext() works without manual runtime initialization.
 * This verifies the fix for GitHub Issue #601.
 *
 * @see https://github.com/agentuity/sdk/issues/601
 */

import { createAgent, createAgentContext } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

// Define a simple echo agent for testing
const echoAgent = createAgent('echo-agent', {
	description: 'A simple agent that echoes its input',
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			echo: s.string(),
			timestamp: s.number(),
		}),
	},
	handler: async (_ctx, input) => {
		return {
			echo: `Echo: ${input.message}`,
			timestamp: Date.now(),
		};
	},
});

// Define an agent without input for testing
const statusAgent = createAgent('status-agent', {
	description: 'A simple agent that returns status',
	schema: {
		output: s.object({
			status: s.string(),
			uptime: s.number(),
		}),
	},
	handler: async () => {
		return {
			status: 'ok',
			uptime: process.uptime(),
		};
	},
});

async function runTests(): Promise<void> {
	console.log('🧪 Starting Standalone Agent Tests...\n');

	let passed = 0;
	let failed = 0;

	// Test 1: Basic createAgentContext() auto-initialization
	console.log('Test 1: createAgentContext() auto-initialization');
	try {
		const ctx = createAgentContext();
		if (!ctx) {
			throw new Error('createAgentContext() returned null');
		}
		if (!ctx.logger) {
			throw new Error('Context missing logger');
		}
		if (!ctx.tracer) {
			throw new Error('Context missing tracer');
		}
		console.log('  ✅ Context created successfully with auto-initialization\n');
		passed++;
	} catch (error) {
		console.error('  ❌ Failed:', (error as Error).message, '\n');
		failed++;
	}

	// Test 2: ctx.run() with input
	console.log('Test 2: ctx.run() with agent that has input');
	try {
		const ctx = createAgentContext();
		const result = await ctx.run(echoAgent, { message: 'Hello, World!' });

		if (!result) {
			throw new Error('ctx.run() returned null');
		}
		if (typeof result !== 'object') {
			throw new Error(`Expected object, got ${typeof result}`);
		}
		const typedResult = result as { echo: string; timestamp: number };
		if (typedResult.echo !== 'Echo: Hello, World!') {
			throw new Error(`Expected "Echo: Hello, World!", got "${typedResult.echo}"`);
		}
		if (typeof typedResult.timestamp !== 'number') {
			throw new Error(`Expected timestamp to be number, got ${typeof typedResult.timestamp}`);
		}
		console.log(`  ✅ Agent executed successfully: ${typedResult.echo}\n`);
		passed++;
	} catch (error) {
		console.error('  ❌ Failed:', (error as Error).message, '\n');
		failed++;
	}

	// Test 3: ctx.run() without input
	console.log('Test 3: ctx.run() with agent without input');
	try {
		const ctx = createAgentContext();
		const result = await ctx.run(statusAgent);

		if (!result) {
			throw new Error('ctx.run() returned null');
		}
		const typedResult = result as { status: string; uptime: number };
		if (typedResult.status !== 'ok') {
			throw new Error(`Expected status "ok", got "${typedResult.status}"`);
		}
		if (typeof typedResult.uptime !== 'number') {
			throw new Error(`Expected uptime to be number, got ${typeof typedResult.uptime}`);
		}
		console.log(`  ✅ Agent executed successfully: status=${typedResult.status}\n`);
		passed++;
	} catch (error) {
		console.error('  ❌ Failed:', (error as Error).message, '\n');
		failed++;
	}

	// Test 4: Context with options
	console.log('Test 4: createAgentContext() with trigger option');
	try {
		const ctx = createAgentContext({ trigger: 'cron' });
		const result = await ctx.run(echoAgent, { message: 'Cron triggered' });

		const typedResult = result as { echo: string };
		if (typedResult.echo !== 'Echo: Cron triggered') {
			throw new Error(`Expected "Echo: Cron triggered", got "${typedResult.echo}"`);
		}
		console.log(`  ✅ Context with options works: ${typedResult.echo}\n`);
		passed++;
	} catch (error) {
		console.error('  ❌ Failed:', (error as Error).message, '\n');
		failed++;
	}

	// Test 5: Multiple ctx.run() calls on same context
	console.log('Test 5: Multiple ctx.run() calls on same context');
	try {
		const ctx = createAgentContext();
		const result1 = await ctx.run(echoAgent, { message: 'First' });
		const result2 = await ctx.run(echoAgent, { message: 'Second' });
		const result3 = await ctx.run(statusAgent);

		const r1 = result1 as { echo: string };
		const r2 = result2 as { echo: string };
		const r3 = result3 as { status: string };

		if (r1.echo !== 'Echo: First') {
			throw new Error(`First call failed: ${r1.echo}`);
		}
		if (r2.echo !== 'Echo: Second') {
			throw new Error(`Second call failed: ${r2.echo}`);
		}
		if (r3.status !== 'ok') {
			throw new Error(`Third call failed: ${r3.status}`);
		}
		console.log('  ✅ Multiple calls on same context work\n');
		passed++;
	} catch (error) {
		console.error('  ❌ Failed:', (error as Error).message, '\n');
		failed++;
	}

	// Summary
	console.log('━'.repeat(50));
	console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

	if (failed > 0) {
		console.log('❌ Some tests failed!\n');
		process.exit(1);
	} else {
		console.log('✅ All tests passed!\n');
		process.exit(0);
	}
}

// Run tests
runTests().catch((error) => {
	console.error('❌ Unexpected error:', error);
	process.exit(1);
});
