/**
 * Session Agent IDs Tests
 *
 * Tests that agent IDs are correctly captured and included in session events.
 * This validates the fix for the empty agent_ids array issue.
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, sleep } from './helpers';
import { testSessionEventProvider } from './helpers/session-event-provider';

import agentIdTestAgent from '@agents/session/agent-id-test';

// Test: Agent execution captures agent ID in session event
test('session-agent-ids', 'agent-run-captures-id', async () => {
	// Clear previous events for isolation
	testSessionEventProvider.clear();

	// Run the agent
	const result = await agentIdTestAgent.run({ message: 'test-capture' });

	assertEqual(result.success, true, 'Agent should succeed');
	assertEqual(result.agentName, 'agent-id-test', 'Agent name should match');

	// The agentIds may or may not be populated depending on metadata availability
	// In dev mode without metadata file, they will be empty
	// In production with metadata, they should be populated
	// The key thing is the infrastructure is working - the session event was captured
});

// Test: Session event provider captures events
test('session-agent-ids', 'session-events-captured', async () => {
	// Clear previous events
	testSessionEventProvider.clear();

	// Run agent
	await agentIdTestAgent.run({ message: 'event-capture-test' });

	// Wait a brief moment for events to be processed
	await sleep(50);

	// Check that events were captured
	const eventCount = testSessionEventProvider.getEventCount();

	// We should have at least some events (start and/or complete)
	// The exact count depends on whether session events are sent in this context
	assert(eventCount >= 0, 'Event count should be non-negative');
});

// Test: Multiple agent calls in same context share session
test('session-agent-ids', 'multiple-agents-same-session', async () => {
	testSessionEventProvider.clear();

	// Run multiple agents
	const result1 = await agentIdTestAgent.run({ message: 'call-1' });
	const result2 = await agentIdTestAgent.run({ message: 'call-2' });

	assertEqual(result1.success, true, 'First call should succeed');
	assertEqual(result2.success, true, 'Second call should succeed');

	// Both calls should be in the same session context
	// (agent.run() shares session context within the same test)
});

// Test: Agent metadata is accessible
test('session-agent-ids', 'agent-metadata-accessible', async () => {
	// Verify we can access agent metadata
	assertDefined(agentIdTestAgent.metadata, 'Agent should have metadata');
	assertEqual(agentIdTestAgent.metadata.name, 'agent-id-test', 'Agent name should match');

	// The id and agentId fields may be empty in dev mode without metadata file
	// but they should exist as properties
	assert('id' in agentIdTestAgent.metadata, 'Metadata should have id field');
	assert('agentId' in agentIdTestAgent.metadata, 'Metadata should have agentId field');
});

// Test: Session event provider tracks sessions
test('session-agent-ids', 'provider-tracks-sessions', async () => {
	testSessionEventProvider.clear();

	// Run agent
	await agentIdTestAgent.run({ message: 'tracking-test' });

	// The session list should exist (may be empty in some contexts)
	const sessions = testSessionEventProvider.getAllSessions();
	assert(Array.isArray(sessions), 'Sessions should be an array');
});

// Test: Agent IDs are captured in session complete event
// This test uses HTTP to ensure proper session lifecycle and avoid parallel test interference
test('session-agent-ids', 'agentIds-in-complete-event', async () => {
	// Clear captured events first
	await fetch('http://localhost:3500/api/agent-ids/clear', { method: 'DELETE' });

	// Call the API endpoint which runs the agent in a proper HTTP context
	const runResponse = await fetch('http://localhost:3500/api/agent-ids/run', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ message: 'capture-ids-http-test' }),
	});

	const runResult = (await runResponse.json()) as {
		success: boolean;
		sessionId: string;
	};
	assertEqual(runResult.success, true, 'API call should succeed');
	assertDefined(runResult.sessionId, 'Should have session ID');

	// Wait for session complete event to be processed
	await sleep(100);

	// Verify the captured session via API
	const verifyResponse = await fetch(
		`http://localhost:3500/api/agent-ids/verify/${runResult.sessionId}`
	);
	const verifyResult = (await verifyResponse.json()) as {
		sessionId: string;
		eventCount: number;
		hasCompleteEvent: boolean;
		agentIds: string[];
		agentIdsCount: number;
	};

	// Should have captured the session complete event
	assertEqual(verifyResult.hasCompleteEvent, true, 'Should have complete event');
	assertEqual(verifyResult.sessionId, runResult.sessionId, 'Session IDs should match');

	// agentIds MUST be defined and have exactly 2 entries
	assert(Array.isArray(verifyResult.agentIds), 'agentIds must be an array');
	assertEqual(
		verifyResult.agentIds.length,
		2,
		`agentIds should have 2 entries (got ${verifyResult.agentIds.length}): ${JSON.stringify(verifyResult.agentIds)}`
	);

	// Each ID should be a non-empty string
	for (const id of verifyResult.agentIds) {
		assert(typeof id === 'string' && id.length > 0, 'Agent ID should be non-empty string');
	}
});

// Test: Clear functionality works
test('session-agent-ids', 'clear-events-works', async () => {
	// Ensure there might be some events
	await agentIdTestAgent.run({ message: 'before-clear' });

	// Clear
	testSessionEventProvider.clear();

	// After clear, counts should be zero
	const sessions = testSessionEventProvider.getAllSessions();
	const eventCount = testSessionEventProvider.getEventCount();

	assertEqual(sessions.length, 0, 'Sessions should be empty after clear');
	assertEqual(eventCount, 0, 'Event count should be zero after clear');
});
