/**
 * Session & Thread Tests
 *
 * Tests session ID generation, thread persistence, state management, and event listeners
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined } from './helpers';

import sessionBasicAgent from '@agents/session/session-basic';
import sessionEventsAgent from '@agents/session/session-events';

// Test: Get session and thread IDs
test('session', 'get-ids', async () => {
	const result = await sessionBasicAgent.run({
		operation: 'get-ids',
	});

	assertEqual(result.success, true);
	assertDefined(result.sessionId, 'Session ID should be defined');
	assertDefined(result.threadId, 'Thread ID should be defined');
	assert(result.sessionId!.startsWith('sess_'), 'Session ID should start with sess_');
	assert(result.threadId!.startsWith('thrd_'), 'Thread ID should start with thrd_');
});

// Test: Session IDs are consistent within same context
test('session', 'session-id-consistency', async () => {
	const result1 = await sessionBasicAgent.run({ operation: 'get-ids' });
	const result2 = await sessionBasicAgent.run({ operation: 'get-ids' });

	assertDefined(result1.sessionId);
	assertDefined(result2.sessionId);
	// agent.run() shares session context, so IDs will be the same
	assertEqual(
		result1.sessionId,
		result2.sessionId,
		'Session IDs should be consistent in same test context'
	);
});

// Test: Session state set and get
test('session', 'session-state', async () => {
	const setResult = await sessionBasicAgent.run({
		operation: 'session-state-set',
		key: 'testKey',
		value: 'testValue',
	});

	assertEqual(setResult.success, true);
	assertEqual(setResult.stateSize, 1);

	const getResult = await sessionBasicAgent.run({
		operation: 'session-state-get',
		key: 'testKey',
	});

	assertEqual(getResult.success, true);
	// Session state persists within same test context (shared session)
	assertEqual(getResult.value, 'testValue', 'Session state should persist in same context');
});

// Test: Thread state set and get
test('session', 'thread-state-set', async () => {
	const result = await sessionBasicAgent.run({
		operation: 'thread-state-set',
		key: 'threadKey',
		value: 'threadValue',
	});

	assertEqual(result.success, true);
	assertDefined(result.stateSize);
});

// Test: Thread state get
test('session', 'thread-state-get', async () => {
	const result = await sessionBasicAgent.run({
		operation: 'thread-state-get',
		key: 'threadKey',
	});

	assertEqual(result.success, true);
	// Thread state is also scoped, won't persist across different runs without cookies
});

// Test: Thread empty check
test('session', 'thread-empty', async () => {
	const result = await sessionBasicAgent.run({
		operation: 'thread-empty',
	});

	assertEqual(result.success, true);
	assertDefined(result.value);
});

// Test: Session completed event listener
test('session', 'session-completed-listener', async () => {
	const result = await sessionEventsAgent.run({
		operation: 'session-completed-listener',
	});

	assertEqual(result.success, true);
	assertDefined(result.message);
});

// Test: Thread destroyed event listener
test('session', 'thread-destroyed-listener', async () => {
	const result = await sessionEventsAgent.run({
		operation: 'thread-destroyed-listener',
	});

	assertEqual(result.success, true);
	assertDefined(result.message);
});

// Test: Concurrent calls share session context
test('session', 'concurrent-sessions', async () => {
	const results = await Promise.all([
		sessionBasicAgent.run({ operation: 'get-ids' }),
		sessionBasicAgent.run({ operation: 'get-ids' }),
		sessionBasicAgent.run({ operation: 'get-ids' }),
	]);

	const sessionIds = results.map((r) => r.sessionId);

	// All calls in same test share the session context
	const uniqueIds = new Set(sessionIds);
	assertEqual(uniqueIds.size, 1, 'All calls should share same session in test context');
});

// Test: Session state persistence within context
test('session', 'session-state-persistence', async () => {
	// Set state in first call
	await sessionBasicAgent.run({
		operation: 'session-state-set',
		key: 'persistent',
		value: 'value1',
	});

	// Get in second call (same session context)
	const result = await sessionBasicAgent.run({
		operation: 'session-state-get',
		key: 'persistent',
	});

	// Should find the value since it's the same session context
	assertEqual(result.value, 'value1', 'Session state should persist in same context');
});

// Test: Multiple state operations in sequence
test('session', 'multiple-state-ops', async () => {
	const results = await Promise.all([
		sessionBasicAgent.run({
			operation: 'thread-state-set',
			key: 'key1',
			value: 'val1',
		}),
		sessionBasicAgent.run({
			operation: 'thread-state-set',
			key: 'key2',
			value: 'val2',
		}),
		sessionBasicAgent.run({
			operation: 'thread-state-set',
			key: 'key3',
			value: 'val3',
		}),
	]);

	results.forEach((result, i) => {
		assertEqual(result.success, true, `Operation ${i} should succeed`);
	});
});
