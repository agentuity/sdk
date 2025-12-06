/**
 * Basic Agent Tests
 *
 * Tests core agent functionality: creation, execution, validation, async behavior
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, assertThrows } from './helpers';

// Import agents to trigger registration
import simpleAgent from '@agents/basic/basic-simple';
import asyncAgent from '@agents/basic/basic-async';
import noInputAgent from '@agents/basic/basic-no-input';
import noOutputAgent from '@agents/basic/basic-no-output';

// Helper to call agents
async function callAgent(agent: any, input?: any) {
	// Use agent.run() which provides full context automatically
	return agent.run(input);
}

// Test: Simple agent with valid input
test('basic', 'simple-valid-input', async () => {
	const result = await callAgent(simpleAgent, { name: 'Alice', age: 30 });

	assertDefined(result, 'Result should be defined');
	assertEqual(result.message, 'Hello, Alice! You are 30 years old.');
	assert(typeof result.timestamp === 'number', 'Timestamp should be a number');
	assert(result.timestamp > 0, 'Timestamp should be positive');
});

// Test: Simple agent metadata
test('basic', 'simple-metadata', async () => {
	assertDefined(simpleAgent.metadata, 'Agent should have metadata');
	assertEqual(simpleAgent.metadata.name, 'simple');
	assertEqual(simpleAgent.metadata.description, 'Basic agent with input/output validation');
});

// Test: Async agent with delay
test('basic', 'async-handler', async () => {
	const delay = 10; // 10ms delay
	const start = Date.now();
	const result = await callAgent(asyncAgent, { delay, message: 'Test' });
	const actualElapsed = Date.now() - start;

	assertDefined(result, 'Result should be defined');
	assertEqual(result.result, 'Processed: Test');
	assert(
		result.elapsed >= delay,
		`Elapsed time (${result.elapsed}) should be >= delay (${delay})`
	);
	assert(
		actualElapsed >= delay,
		`Actual elapsed (${actualElapsed}) should be >= delay (${delay})`
	);
});

// Test: No-input agent
test('basic', 'no-input-agent', async () => {
	const result = await callAgent(noInputAgent);

	assertDefined(result, 'Result should be defined');
	assert(typeof result.timestamp === 'number', 'Timestamp should be a number');
	assert(typeof result.random === 'number', 'Random should be a number');
	assert(result.random >= 0 && result.random < 1, 'Random should be between 0 and 1');
});

// Test: No-output agent
test('basic', 'no-output-agent', async () => {
	const result = await callAgent(noOutputAgent, { action: 'test-action' });

	// Agent returns void/undefined
	assert(result === undefined, 'Result should be undefined for void output');
});

// Test: Agent has schemas defined
test('basic', 'agent-schemas-defined', async () => {
	// Agents should have metadata with schemas
	assertDefined(simpleAgent.metadata, 'Agent should have metadata');
	assertDefined(asyncAgent.metadata, 'Async agent should have metadata');
});

// Test: Concurrent agent calls
test('basic', 'concurrent-execution', async () => {
	const calls = Array.from({ length: 5 }, (_, i) =>
		callAgent(simpleAgent, { name: `User${i}`, age: 20 + i })
	);

	const results = await Promise.all(calls);

	assertEqual(results.length, 5, 'Should have 5 results');

	for (let i = 0; i < 5; i++) {
		assertEqual(results[i].message, `Hello, User${i}! You are ${20 + i} years old.`);
	}
});

// Test: Agent handler async behavior
test('basic', 'async-promise-handling', async () => {
	// Verify that handlers properly handle promises
	const result = await callAgent(asyncAgent, { delay: 1, message: 'async-test' });

	assertDefined(result, 'Async result should be defined');
	assertEqual(result.result, 'Processed: async-test');
});
