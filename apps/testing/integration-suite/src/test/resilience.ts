/**
 * Server Resilience Tests
 *
 * Tests that various error scenarios do NOT crash the server.
 * Each test attempts to cause a crash in different ways and verifies
 * the server handles it gracefully.
 */

import { test } from '@test/suite';
import { assert, assertEqual } from '@test/helpers';
import crashAttemptsAgent from '@agents/resilience/crash-attempts';

// Test: Synchronous throw in handler
test('resilience', 'sync-throw-caught', async () => {
	try {
		await crashAttemptsAgent.run({ scenario: 'sync-throw' });
		throw new Error('Should have thrown');
	} catch (err: any) {
		// Should catch the error, not crash
		assert(err.message.includes('Intentional synchronous throw'), 'Should catch sync throw');
	}
});

// Test: Async throw in handler
test('resilience', 'async-throw-caught', async () => {
	try {
		await crashAttemptsAgent.run({ scenario: 'async-throw' });
		throw new Error('Should have thrown');
	} catch (err: any) {
		assert(err.message.includes('Intentional async throw'), 'Should catch async throw');
	}
});

// Test: Background task throws
test('resilience', 'waituntil-throw-survives', async () => {
	const result = await crashAttemptsAgent.run({ scenario: 'waituntil-throw' });
	assertEqual(result.survived, true);
	assert(result.message.includes('Background task'), 'Background task was scheduled');
});

// Test: Sync background task throws
test('resilience', 'waituntil-sync-throw-survives', async () => {
	const result = await crashAttemptsAgent.run({ scenario: 'waituntil-sync-throw' });
	assertEqual(result.survived, true);
	assert(result.message.includes('Sync background'), 'Sync background task was scheduled');
});

// Test: Unhandled promise rejection (skipped - would crash server as expected)
test('resilience', 'unhandled-promise-note', async () => {
	const result = await crashAttemptsAgent.run({ scenario: 'unhandled-promise' });
	assertEqual(result.survived, true);
	assert(result.message.includes('Skipped'), 'Test documents expected behavior');
});

// Test: Nested errors
test('resilience', 'nested-error-caught', async () => {
	try {
		await crashAttemptsAgent.run({ scenario: 'nested-error' });
		throw new Error('Should have thrown');
	} catch (err: any) {
		assert(err.message.includes('Outer error'), 'Should catch nested error');
	}
});

// Test: Stack overflow protection
test('resilience', 'stack-overflow-caught', async () => {
	const result = await crashAttemptsAgent.run({ scenario: 'stack-overflow' });
	assertEqual(result.survived, true);
	assert(result.message.includes('Caught recursion'), 'Recursion was caught');
});

// Test: Null dereference
test('resilience', 'null-deref-caught', async () => {
	try {
		await crashAttemptsAgent.run({ scenario: 'null-deref' });
		throw new Error('Should have thrown');
	} catch (err: any) {
		assert(err.message.includes('null'), 'Should catch null dereference');
	}
});

// Test: Type error
test('resilience', 'type-error-caught', async () => {
	try {
		await crashAttemptsAgent.run({ scenario: 'type-error' });
		throw new Error('Should have thrown');
	} catch (err: any) {
		assert(
			err.message.includes('not a function') || err.message.includes('toFixed'),
			'Should catch type error'
		);
	}
});

// Test: Multiple background tasks all throwing
test('resilience', 'multiple-waituntil-throws-survives', async () => {
	const result = await crashAttemptsAgent.run({ scenario: 'multiple-waituntil-throws' });
	assertEqual(result.survived, true);
	assert(result.message.includes('5 background tasks'), 'Multiple background tasks scheduled');
});

// Test: Event listener throws
test('resilience', 'event-listener-throw-survives', async () => {
	const result = await crashAttemptsAgent.run({ scenario: 'event-listener-throw' });
	assertEqual(result.survived, true);
	assert(result.message.toLowerCase().includes('event listener'), 'Event listener was registered');
});

// Test: process.exit is blocked
test('resilience', 'process-exit-blocked', async () => {
	const result = await crashAttemptsAgent.run({ scenario: 'process-exit-attempt' });
	assertEqual(result.survived, true);
	assert(result.message.includes('blocked'), 'process.exit was blocked');
});
