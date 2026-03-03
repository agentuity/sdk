/**
 * Evals Tests
 *
 * Tests eval framework functionality: execution, scoring, error handling
 */

import { test } from './suite';
import { assertEqual, assertDefined } from './helpers';

import evalsBasicAgent from '@agents/evals/basic';
import evalsSeparateAgent from '@agents/evals/separate/agent';

// Test: Basic agent execution with evals attached
test('evals', 'agent-execution', async () => {
	const result = await evalsBasicAgent.run({ value: 5 });

	assertDefined(result, 'Result should be defined');
	assertEqual(result.result, 10, 'Result should be double the input');
	assertEqual(result.doubled, true, 'Doubled flag should be true');
});

// Test: Agent with negative input
test('evals', 'negative-input', async () => {
	const result = await evalsBasicAgent.run({ value: -3 });

	assertEqual(result.result, -6, 'Negative values should also double');
	assertEqual(result.doubled, true);
});

// Test: Agent with zero input
test('evals', 'zero-input', async () => {
	const result = await evalsBasicAgent.run({ value: 0 });

	assertEqual(result.result, 0, 'Zero doubled is zero');
	assertEqual(result.doubled, true);
});

// Test: Agent with evals defined in separate eval.ts file
test('evals', 'separate-eval-file', async () => {
	const result = await evalsSeparateAgent.run({ value: 7 });

	assertDefined(result, 'Result should be defined');
	assertEqual(result.doubled, 14, 'Result should be double the input');
});

// Test: Separate eval file - negative input
test('evals', 'separate-eval-file-negative', async () => {
	const result = await evalsSeparateAgent.run({ value: -5 });

	assertEqual(result.doubled, -10, 'Negative values should also double');
});
