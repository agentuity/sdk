/**
 * Lifecycle WaitUntil Tests
 *
 * Tests background task scheduling with ctx.waitUntil()
 */

import { test } from './suite';
import { assertEqual, assertDefined } from './helpers';

import waitUntilAgent from '@agents/lifecycle/waituntil';

// Test: Schedule basic background task
test('lifecycle', 'waituntil-basic', async () => {
	const result = await waitUntilAgent.run({
		operation: 'schedule-task',
		taskData: 'test-data',
	});

	assertEqual(result.success, true);
	assertEqual(result.taskScheduled, true);
	assertDefined(result.message);
});

// Test: Schedule multiple background tasks
test('lifecycle', 'waituntil-multiple', async () => {
	const result = await waitUntilAgent.run({
		operation: 'schedule-multiple',
		taskCount: 5,
	});

	assertEqual(result.success, true);
	assertEqual(result.taskScheduled, true);
	assertEqual(result.message, 'Scheduled 5 background tasks');
});

// Test: Background task with error (should not fail main request)
test('lifecycle', 'waituntil-error-handling', async () => {
	const result = await waitUntilAgent.run({
		operation: 'schedule-with-error',
		shouldError: true,
	});

	// Main request should succeed even if background task errors
	assertEqual(result.success, true);
	assertEqual(result.taskScheduled, true);
});

// Test: Background task without error
test('lifecycle', 'waituntil-no-error', async () => {
	const result = await waitUntilAgent.run({
		operation: 'schedule-with-error',
		shouldError: false,
	});

	assertEqual(result.success, true);
	assertEqual(result.taskScheduled, true);
});

// Test: Schedule promise-based task
test('lifecycle', 'waituntil-promise', async () => {
	const result = await waitUntilAgent.run({
		operation: 'schedule-promise',
	});

	assertEqual(result.success, true);
	assertEqual(result.taskScheduled, true);
});

// Test: Schedule synchronous function
test('lifecycle', 'waituntil-sync', async () => {
	const result = await waitUntilAgent.run({
		operation: 'schedule-sync-function',
	});

	assertEqual(result.success, true);
	assertEqual(result.taskScheduled, true);
});
