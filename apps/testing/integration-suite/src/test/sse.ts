/**
 * SSE (Server-Sent Events) Tests
 *
 * Tests server-to-client event streaming via SSE.
 * These tests use real SSE connections to the integration suite server.
 */

import { test } from '@test/suite';
import { assert, assertEqual, assertDefined } from '@test/helpers';
import { createSSEClient } from '@test/helpers/sse-client';

// Test 1: Basic SSE connection and message reception
test('sse', 'basic-connection', async () => {
	const client = createSSEClient('/api/sse/simple');

	await client.connect();
	assert(client.isOpen(), 'SSE connection should be open');

	// Receive the three messages
	const msg1 = await client.receive();
	const msg2 = await client.receive();
	const msg3 = await client.receive();

	assertEqual(msg1.data, 'Message 1');
	assertEqual(msg2.data, 'Message 2');
	assertEqual(msg3.data, 'Message 3');

	client.close();
	assert(!client.isOpen(), 'SSE connection should be closed');
});

// Test 2: Receive multiple messages at once
test('sse', 'receive-multiple-messages', async () => {
	const client = createSSEClient('/api/sse/simple');

	await client.connect();

	// Wait for all 3 messages
	const messages = await client.receiveMultiple(3);

	assertEqual(messages.length, 3);
	assertEqual(messages[0].data, 'Message 1');
	assertEqual(messages[1].data, 'Message 2');
	assertEqual(messages[2].data, 'Message 3');

	client.close();
});

// Test 3: Named events
test('sse', 'named-events', async () => {
	const client = createSSEClient('/api/sse/events');

	// Setup event listeners
	const startEvents: any[] = [];
	const updateEvents: any[] = [];
	const completeEvents: any[] = [];

	client.addEventListener('start', (data) => startEvents.push(data));
	client.addEventListener('update', (data) => updateEvents.push(data));
	client.addEventListener('complete', (data) => completeEvents.push(data));

	await client.connect();

	// Wait for events to arrive
	await new Promise((resolve) => setTimeout(resolve, 100));

	// Verify events were captured
	assertEqual(startEvents.length, 1);
	assertEqual(updateEvents.length, 1);
	assertEqual(completeEvents.length, 1);

	assertDefined(startEvents[0].timestamp);
	assertEqual(updateEvents[0].progress, 50);
	assertEqual(completeEvents[0].status, 'done');

	client.close();
});

// Test 4: Receive specific event type
test('sse', 'receive-specific-event', async () => {
	const client = createSSEClient('/api/sse/events');

	client.addEventListener('start');
	client.addEventListener('update');
	client.addEventListener('complete');

	await client.connect();

	// Wait specifically for the 'complete' event
	const completeMsg = await client.receiveEvent('complete');

	assertEqual(completeMsg.event, 'complete');
	const data = JSON.parse(completeMsg.data);
	assertEqual(data.status, 'done');

	client.close();
});

// Test 5: Counter with query parameters
test('sse', 'query-parameters', async () => {
	const client = createSSEClient('/api/sse/counter', { count: '3', delay: '20' });

	await client.connect();

	// Receive 3 counter messages
	const messages = await client.receiveMultiple(3);

	assertEqual(messages.length, 3);

	const data0 = JSON.parse(messages[0].data);
	const data1 = JSON.parse(messages[1].data);
	const data2 = JSON.parse(messages[2].data);

	assertEqual(data0.count, 0);
	assertEqual(data1.count, 1);
	assertEqual(data2.count, 2);

	client.close();
});

// Test 6: JSON data parsing
test('sse', 'json-data-parsing', async () => {
	const client = createSSEClient('/api/sse/counter', { count: '2', delay: '10' });

	await client.connect();

	// Receive and parse JSON
	const data1 = await client.receiveJSON();
	const data2 = await client.receiveJSON();

	assertEqual(data1.count, 0);
	assertDefined(data1.timestamp);

	assertEqual(data2.count, 1);
	assertDefined(data2.timestamp);

	client.close();
});

// Test 7: Long-lived connection
test('sse', 'long-lived-connection', async () => {
	const client = createSSEClient('/api/sse/long-lived', { duration: '500', delay: '50' });

	await client.connect();

	// Connection should stay open and receive multiple messages
	const messages: any[] = [];
	const startTime = Date.now();

	while (Date.now() - startTime < 600) {
		try {
			const msg = await client.receive(100);
			messages.push(msg);
		} catch {
			// Timeout is ok - stream might have ended
			break;
		}
	}

	// Should have received multiple messages over the duration
	assert(messages.length >= 3, `Should receive at least 3 messages, got ${messages.length}`);

	// Filter out the 'done' event message
	const dataMessages = messages.filter((m) => !m.event || m.event !== 'done');

	// Check that messages were sent over time
	const firstData = JSON.parse(dataMessages[0].data);
	const lastData = JSON.parse(dataMessages[dataMessages.length - 1].data);

	assert(lastData.elapsed > firstData.elapsed, 'Messages should span time');

	client.close();
});

// Test 8: Connection persistence
test('sse', 'connection-persistence', async () => {
	const client = createSSEClient('/api/sse/counter', { count: '5', delay: '100' });

	await client.connect();

	// Receive first message
	const msg1 = await client.receive();
	assertDefined(msg1);

	// Wait 300ms
	await new Promise((resolve) => setTimeout(resolve, 300));

	// Connection should still be active
	assert(client.isOpen(), 'Connection should still be open');

	// Receive more messages
	const msg2 = await client.receive();
	assertDefined(msg2);

	client.close();
});

// Test 9: Event stream ordering
test('sse', 'event-ordering', async () => {
	const client = createSSEClient('/api/sse/counter', { count: '10', delay: '5' });

	await client.connect();

	const messages = await client.receiveMultiple(10);

	// Verify messages are in order
	for (let i = 0; i < 10; i++) {
		const data = JSON.parse(messages[i].data);
		assertEqual(data.count, i, `Message ${i} should have count ${i}`);
	}

	client.close();
});

// Test 10: Pending messages retrieval
test('sse', 'pending-messages', async () => {
	const client = createSSEClient('/api/sse/simple');

	await client.connect();

	// Wait for messages to arrive
	await new Promise((resolve) => setTimeout(resolve, 100));

	// Get all pending messages at once
	const pending = client.getPendingMessages();

	assertEqual(pending.length, 3);
	assertEqual(pending[0].data, 'Message 1');
	assertEqual(pending[1].data, 'Message 2');
	assertEqual(pending[2].data, 'Message 3');

	// Pending messages should be cleared
	const morePending = client.getPendingMessages();
	assertEqual(morePending.length, 0);

	client.close();
});

// Test 11: Client abort handling
test('sse', 'client-abort', async () => {
	const client = createSSEClient('/api/sse/abort-test');

	await client.connect();

	// Receive a few messages
	const msg1 = await client.receive();
	const msg2 = await client.receive();

	assertDefined(msg1);
	assertDefined(msg2);

	// Close the connection (abort from client side)
	client.close();
	assert(!client.isOpen(), 'Connection should be closed');

	// Server should detect abort and stop sending
	// (We can't directly test server behavior, but connection closes cleanly)
});

// Test 12: Multiple sequential connections
test('sse', 'multiple-sequential-connections', async () => {
	// First connection
	const client1 = createSSEClient('/api/sse/simple');
	await client1.connect();
	const msg1 = await client1.receive();
	assertEqual(msg1.data, 'Message 1');
	client1.close();

	// Second connection
	const client2 = createSSEClient('/api/sse/simple');
	await client2.connect();
	const msg2 = await client2.receive();
	assertEqual(msg2.data, 'Message 1');
	client2.close();

	// Third connection
	const client3 = createSSEClient('/api/sse/simple');
	await client3.connect();
	const msg3 = await client3.receive();
	assertEqual(msg3.data, 'Message 1');
	client3.close();
});
