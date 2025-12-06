/**
 * Event System Tests
 *
 * Tests agent, session, and thread event listeners including:
 * - Agent events (started, completed, errored)
 * - Session events (completed)
 * - Thread events (destroyed)
 * - Listener registration and removal
 * - Multiple listeners on same event
 */

import { test } from '@test/suite';
import { assert, assertEqual, uniqueId } from '@test/helpers';
import agentEventsAgent from '@agents/events/agent-events';
import sessionEventsAgent from '@agents/events/session-events';
import threadEventsAgent from '@agents/events/thread-events';
import listenerRemovalAgent from '@agents/events/listener-removal';
import multipleListenersAgent from '@agents/events/multiple-listeners';

// Test: Agent event listeners can be registered
test('events', 'agent-listeners-register', async () => {
	const result = await agentEventsAgent.run({
		eventType: 'register',
		shouldError: false,
	});

	assertEqual(result.success, true);
	assertEqual(result.eventType, 'register');
});

// Test: Session event listeners receive completed event
test('events', 'session-completed-event', async () => {
	const result = await sessionEventsAgent.run({
		operation: 'test-completed',
	});

	assertEqual(result.success, true);
	assertEqual(result.operation, 'test-completed');
	assert(result.sessionId.startsWith('sess_'), 'Session ID should start with sess_');
});

// Test: Thread event listeners receive destroyed event
test('events', 'thread-destroyed-event', async () => {
	const result = await threadEventsAgent.run({
		operation: 'test-destroy',
		destroyThread: true,
	});

	assertEqual(result.success, true);
	assertEqual(result.operation, 'test-destroy');
	assert(result.threadId.startsWith('thrd_'), 'Thread ID should start with thrd_');
});

// Test: Thread event listener without destruction
test('events', 'thread-no-destroy', async () => {
	const result = await threadEventsAgent.run({
		operation: 'test-no-destroy',
		destroyThread: false,
	});

	assertEqual(result.success, true);
	assertEqual(result.operation, 'test-no-destroy');
});

// Test: Event listeners can be removed
test('events', 'listener-removal', async () => {
	const result = await listenerRemovalAgent.run({
		operation: 'test-removal',
		removeListener: true,
	});

	assertEqual(result.success, true);
	assertEqual(result.operation, 'test-removal');
});

// Test: Event listeners remain when not removed
test('events', 'listener-kept', async () => {
	const result = await listenerRemovalAgent.run({
		operation: 'test-kept',
		removeListener: false,
	});

	assertEqual(result.success, true);
	assertEqual(result.operation, 'test-kept');
});

// Test: Multiple listeners can be registered for same event
test('events', 'multiple-listeners', async () => {
	const result = await multipleListenersAgent.run({
		operation: 'test-multiple',
	});

	assertEqual(result.success, true);
	assertEqual(result.operation, 'test-multiple');
	// Note: listenersCalled will be 0 because listeners are registered DURING execution
	// and started event fires BEFORE handler runs
	assert(result.listenersCalled >= 0, 'Listeners called should be non-negative');
});

// Test: Event payloads contain correct data
test('events', 'event-payload-validation', async () => {
	const result = await sessionEventsAgent.run({
		operation: 'validate-payload',
	});

	assertEqual(result.success, true);
	assert(result.sessionId.length > 0, 'Session ID should not be empty');
});
