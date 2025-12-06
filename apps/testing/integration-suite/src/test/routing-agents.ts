/**
 * Routing & HTTP Tests
 *
 * Tests HTTP routing, methods, query params, headers, and request handling
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined } from './helpers';

// Import agents
import getAgent from '@agents/routing/routing-get';
import postAgent from '@agents/routing/routing-post';
import methodsAgent from '@agents/routing/routing-methods';
import headersAgent from '@agents/routing/routing-headers';
import paramsAgent from '@agents/routing/routing-params';

// Helper to call agents
async function callAgent(agent: any, input?: any) {
	// Use agent.run() which provides full context automatically
	return agent.run(input);
}

// Test: GET agent with query parameters
test('routing', 'get-with-query-params', async () => {
	const result = await callAgent(getAgent, { query: 'test search', limit: 20 });

	assertDefined(result, 'Result should be defined');
	assertEqual(result.query, 'test search');
	assertEqual(result.limit, 20);
	assert(typeof result.timestamp === 'number', 'Timestamp should be a number');
});

// Test: GET agent with default limit
test('routing', 'get-default-params', async () => {
	const result = await callAgent(getAgent, { query: 'test' });

	assertDefined(result, 'Result should be defined');
	assertEqual(result.query, 'test');
	assertEqual(result.limit, 10, 'Should use default limit of 10');
});

// Test: POST agent with JSON body
test('routing', 'post-json-body', async () => {
	const result = await callAgent(postAgent, {
		title: 'Test Post',
		content: 'This is a test post',
		tags: ['test', 'example'],
	});

	assertDefined(result, 'Result should be defined');
	assert(result.id.startsWith('post-'), 'ID should have post- prefix');
	assertEqual(result.title, 'Test Post');
	assertEqual(result.content, 'This is a test post');
	assertEqual(result.tags.length, 2);
	assertEqual(result.tags[0], 'test');
	assertEqual(result.tags[1], 'example');
});

// Test: POST agent with optional fields
test('routing', 'post-optional-fields', async () => {
	const result = await callAgent(postAgent, {
		title: 'Minimal Post',
		content: 'Just the basics',
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.tags.length, 0, 'Tags should be empty array when not provided');
});

// Test: Multiple HTTP methods
test('routing', 'multiple-methods', async () => {
	const result = await callAgent(methodsAgent, {
		action: 'create',
		data: 'test data',
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.action, 'create');
	assertEqual(result.method, 'POST');
	assert(result.result.includes('test data'), 'Result should include data');
});

// Test: Custom headers via context
test('routing', 'custom-headers', async () => {
	const result = await callAgent(headersAgent, {
		message: 'Hello with headers',
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.message, 'Hello with headers');
	assertDefined(result.sessionId, 'Should have session ID from context');
	assert(typeof result.sessionId === 'string', 'Session ID should be a string');
	assert(result.sessionId.length > 0, 'Session ID should not be empty');
	assert(typeof result.timestamp === 'number', 'Timestamp should be a number');
});

// Test: Route parameters
test('routing', 'route-params', async () => {
	const result = await callAgent(paramsAgent, {
		id: 'user-123',
		action: 'edit',
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.id, 'user-123');
	assertEqual(result.action, 'edit');
	assertEqual(result.found, true);
});

// Test: Route params with defaults
test('routing', 'route-params-defaults', async () => {
	const result = await callAgent(paramsAgent, {
		id: 'user-456',
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.id, 'user-456');
	assertEqual(result.action, 'view', 'Should use default action');
});

// Test: Content-Type handling (via agent metadata)
test('routing', 'content-type-json', async () => {
	// All our agents return JSON by default
	const result = await callAgent(postAgent, {
		title: 'JSON Test',
		content: 'Testing JSON content type',
	});

	assertDefined(result, 'Result should be defined');
	assert(typeof result === 'object', 'Result should be an object (JSON)');
});

// Test: Response status codes (implicit via agent success)
test('routing', 'successful-response', async () => {
	// All successful agent calls should implicitly return 200
	const result = await callAgent(getAgent, { query: 'success test' });

	assertDefined(result, 'Successful agent should return result');
});

// Test: Concurrent routing requests
test('routing', 'concurrent-requests', async () => {
	const requests = [
		callAgent(getAgent, { query: 'req1' }),
		callAgent(getAgent, { query: 'req2' }),
		callAgent(postAgent, { title: 'Post 1', content: 'Content 1' }),
		callAgent(postAgent, { title: 'Post 2', content: 'Content 2' }),
	];

	const results = await Promise.all(requests);

	assertEqual(results.length, 4, 'All requests should complete');
	assertEqual(results[0].query, 'req1');
	assertEqual(results[1].query, 'req2');
	assertEqual(results[2].title, 'Post 1');
	assertEqual(results[3].title, 'Post 2');
});

// Test: Query parameter type coercion
test('routing', 'query-param-types', async () => {
	// Numbers should be properly typed
	const result = await callAgent(getAgent, { query: 'test', limit: 25 });

	assert(typeof result.limit === 'number', 'Limit should be a number');
	assertEqual(result.limit, 25);
});
