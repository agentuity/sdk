/**
 * HTTP State Persistence Tests
 *
 * Tests thread and session state persistence across HTTP requests with cookies.
 * These tests use the real HTTP server (port 3500) instead of agent.run().
 */

import { test } from '@test/suite';
import { assert, assertEqual, assertDefined, uniqueId } from '@test/helpers';
import { CookieJar, httpRequest, getSessionId, getThreadId } from '@test/helpers/http-client';

const BASE_URL = 'http://localhost:3500/api';

// Test 1: Save thread state via HTTP POST
test('http-state-persistence', 'save-thread-state', async () => {
	const jar = new CookieJar();
	const testData = uniqueId('thread-data');

	// First request: save data
	const response = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: testData,
			}),
		},
		jar
	);

	assertEqual(response.status, 200);

	const result = await response.json();
	assertEqual(result.success, true);
	assertEqual(result.threadState.testData, testData);
	assertEqual(result.threadState.requestCount, 1);

	// Verify session ID in headers
	const sessionId = getSessionId(response);
	assertDefined(sessionId);

	// Verify thread ID in cookies
	const threadId = getThreadId(jar);
	assertDefined(threadId);
});

// Test 2: Restore thread state in second request with same cookie
test('http-state-persistence', 'restore-thread-state', async () => {
	const jar = new CookieJar();
	const testData = uniqueId('thread-data');

	// First request: save data
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: testData,
			}),
		},
		jar
	);

	// Second request: read data with same cookies
	const response2 = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'read',
			}),
		},
		jar
	);

	assertEqual(response2.status, 200);

	const result2 = await response2.json();
	assertEqual(result2.success, true);
	assertEqual(result2.threadState.testData, testData); // Thread state restored!
	assertEqual(result2.threadState.requestCount, 1); // Counter persisted
});

// Test 3: Session state does NOT persist across requests
test('http-state-persistence', 'session-state-not-persisted', async () => {
	const jar = new CookieJar();
	const sessionData = uniqueId('session-data');

	// First request: save session data
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				sessionData: sessionData,
			}),
		},
		jar
	);

	// Second request: session state should be empty
	const response2 = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'read',
			}),
		},
		jar
	);

	const result2 = await response2.json();
	assertEqual(result2.success, true);
	assertEqual(result2.sessionState.sessionData, undefined); // Session state NOT persisted
});

// Test 4: Thread state persists across multiple requests
test('http-state-persistence', 'multiple-requests-same-thread', async () => {
	const jar = new CookieJar();
	const testData = uniqueId('thread-data');

	// First request
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: testData,
			}),
		},
		jar
	);

	// Second request (increments counter)
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: testData,
			}),
		},
		jar
	);

	// Third request (increments counter again)
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: testData,
			}),
		},
		jar
	);

	// Fourth request: verify counter
	const response4 = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'read',
			}),
		},
		jar
	);

	const result4 = await response4.json();
	assertEqual(result4.threadState.requestCount, 3); // Counter incremented 3 times
});

// Test 5: Different cookies = different thread state
test('http-state-persistence', 'different-cookies-different-threads', async () => {
	const jar1 = new CookieJar();
	const jar2 = new CookieJar();
	const testData1 = uniqueId('thread-1');
	const testData2 = uniqueId('thread-2');

	// First jar: save data
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: testData1,
			}),
		},
		jar1
	);

	// Second jar: save different data
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: testData2,
			}),
		},
		jar2
	);

	// Read from first jar
	const response1 = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'read',
			}),
		},
		jar1
	);

	// Read from second jar
	const response2 = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'read',
			}),
		},
		jar2
	);

	const result1 = await response1.json();
	const result2 = await response2.json();

	// Each jar should have its own thread data
	assertEqual(result1.threadState.testData, testData1);
	assertEqual(result2.threadState.testData, testData2);
});

// Test 6: Session ID header present
test('http-state-persistence', 'session-id-header-present', async () => {
	const jar = new CookieJar();

	// Make request
	const response = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'ids',
			}),
		},
		jar
	);

	const sessionId = getSessionId(response);
	assertDefined(sessionId);
	assert(sessionId.startsWith('sess_'), 'Session ID should start with sess_');
});

// Test 7: Thread ID remains same across requests with cookie
test('http-state-persistence', 'thread-id-same', async () => {
	const jar = new CookieJar();

	// First request
	const response1 = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'ids',
			}),
		},
		jar
	);

	const result1 = await response1.json();
	const threadId1 = result1.threadId;
	assertDefined(threadId1);

	// Second request with same cookie
	const response2 = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'ids',
			}),
		},
		jar
	);

	const result2 = await response2.json();
	const threadId2 = result2.threadId;

	// Thread IDs should be the same
	assertEqual(threadId1, threadId2);
});

// Test 8: Cookie jar extraction works
test('http-state-persistence', 'cookie-jar-extraction', async () => {
	const jar = new CookieJar();

	// Make request
	await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'ids',
			}),
		},
		jar
	);

	// Verify thread ID cookie was stored
	const threadId = getThreadId(jar);
	assertDefined(threadId);
	assert(threadId.startsWith('thrd_'), 'Thread ID should start with thrd_');

	// Verify cookies are accessible
	const cookies = jar.getAll();
	assert(cookies.size > 0, 'Cookie jar should have cookies');
});

// Test 9: Cross-agent thread state sharing (writer -> reader)
test('http-state-persistence', 'cross-agent-state-sharing', async () => {
	const jar = new CookieJar();
	const testData = uniqueId('cross-agent-data');

	// Writer agent: Save data to thread state
	const writeResponse = await httpRequest(
		`${BASE_URL}/agent/state-writer`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'sharedData',
				value: testData,
			}),
		},
		jar
	);

	assertEqual(writeResponse.status, 200);
	const writeResult = await writeResponse.json();
	assertEqual(writeResult.success, true);
	const threadId = writeResult.threadId;

	// Reader agent: Read data from same thread (same cookie)
	const readResponse = await httpRequest(
		`${BASE_URL}/agent/state-reader`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'sharedData',
			}),
		},
		jar
	);

	assertEqual(readResponse.status, 200);
	const readResult = await readResponse.json();
	assertEqual(readResult.success, true);
	assertEqual(readResult.threadId, threadId); // Same thread
	assertEqual(readResult.value, testData); // Data shared across agents!
	assert(readResult.allKeys.includes('sharedData'), 'Reader should see sharedData key');
});

// Test 10: Multiple agents can write and read thread state
test('http-state-persistence', 'multiple-agents-thread-state', async () => {
	const jar = new CookieJar();

	// First agent writes
	await httpRequest(
		`${BASE_URL}/agent/state-writer`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'key1',
				value: 'value1',
			}),
		},
		jar
	);

	// Second agent writes different key
	await httpRequest(
		`${BASE_URL}/agent/state-writer`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'key2',
				value: 'value2',
			}),
		},
		jar
	);

	// Third agent writes yet another key
	await httpRequest(
		`${BASE_URL}/agent/state-writer`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'key3',
				value: { nested: 'object', count: 42 },
			}),
		},
		jar
	);

	// Reader can see all keys
	const readResponse = await httpRequest(
		`${BASE_URL}/agent/state-reader`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'key3',
			}),
		},
		jar
	);

	const readResult = await readResponse.json();
	assertEqual(readResult.success, true);
	assertEqual(readResult.value.nested, 'object');
	assertEqual(readResult.value.count, 42);
	assert(readResult.allKeys.includes('key1'), 'Should have key1');
	assert(readResult.allKeys.includes('key2'), 'Should have key2');
	assert(readResult.allKeys.includes('key3'), 'Should have key3');
	assertEqual(readResult.allKeys.length >= 3, true, 'Should have at least 3 keys');
});

// Test 11: Thread state persists across agent switches
test('http-state-persistence', 'thread-state-across-agent-switches', async () => {
	const jar = new CookieJar();
	const testValue = uniqueId('switch-test');

	// Use writer agent
	await httpRequest(
		`${BASE_URL}/agent/state-writer`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'persistentData',
				value: testValue,
			}),
		},
		jar
	);

	// Use original state agent
	const stateResponse = await httpRequest(
		`${BASE_URL}/agent/state`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save',
				threadData: 'original-agent-data',
			}),
		},
		jar
	);

	const stateResult = await stateResponse.json();
	assertEqual(stateResult.success, true);

	// Use reader agent - should see data from writer
	const readResponse = await httpRequest(
		`${BASE_URL}/agent/state-reader`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'persistentData',
			}),
		},
		jar
	);

	const readResult = await readResponse.json();
	assertEqual(readResult.success, true);
	assertEqual(readResult.value, testValue); // Data persists across agent switches
	assert(readResult.allKeys.includes('testData'), 'Should have original agent data');
	assert(readResult.allKeys.includes('requestCount'), 'Should have request counter');
});

// Test 12: Complex object persistence across agents
test('http-state-persistence', 'complex-object-persistence', async () => {
	const jar = new CookieJar();
	const complexData = {
		user: { id: 123, name: 'Alice', roles: ['admin', 'user'] },
		metadata: { createdAt: new Date().toISOString(), version: '1.0' },
		settings: { theme: 'dark', notifications: true },
	};

	// Writer stores complex object
	await httpRequest(
		`${BASE_URL}/agent/state-writer`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'userProfile',
				value: complexData,
			}),
		},
		jar
	);

	// Reader retrieves complex object
	const readResponse = await httpRequest(
		`${BASE_URL}/agent/state-reader`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				key: 'userProfile',
			}),
		},
		jar
	);

	const readResult = await readResponse.json();
	assertEqual(readResult.success, true);
	assertEqual(readResult.value.user.name, 'Alice');
	assertEqual(readResult.value.user.roles[0], 'admin');
	assertEqual(readResult.value.settings.theme, 'dark');
	assertEqual(readResult.value.metadata.version, '1.0');
});
