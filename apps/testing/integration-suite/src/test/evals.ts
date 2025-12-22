/**
 * Eval Framework Tests
 *
 * Tests eval creation, execution, scoring, and result validation
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined } from './helpers';

import evalsBasicAgent from '@agents/eval-basic/basic';

// Test: Agent with evals executes normally
test('evals', 'agent-execution', async () => {
	const result = await evalsBasicAgent.run({
		value: 5,
	});

	assertEqual(result.result, 10);
	assertEqual(result.doubled, true);
});

// Note: Eval metadata is stored in the agent registry, not directly on agent
// Evals are executed automatically during agent runs in production
// For testing, we verify the agent still works correctly with evals attached

// Test: Agent execution with positive value
test('evals', 'positive-value', async () => {
	const result = await evalsBasicAgent.run({
		value: 10,
	});

	assertEqual(result.result, 20);
	assert(result.result > 0, 'Result should be positive for check-positive eval');
});

// Test: Agent execution with negative value
test('evals', 'negative-value', async () => {
	const result = await evalsBasicAgent.run({
		value: -5,
	});

	assertEqual(result.result, -10);
	assert(result.result < 0, 'Result should be negative');
});

// Test: Agent execution with zero
test('evals', 'zero-value', async () => {
	const result = await evalsBasicAgent.run({
		value: 0,
	});

	assertEqual(result.result, 0);
	assert(result.result === 0, 'Result should be zero');
});

// Test: Large value execution
test('evals', 'large-value', async () => {
	const result = await evalsBasicAgent.run({
		value: 1000,
	});

	assertEqual(result.result, 2000);
	assert(result.result % 2 === 0, 'Result should be even for check-even eval');
});
