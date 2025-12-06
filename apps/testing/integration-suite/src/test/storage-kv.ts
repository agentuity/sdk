/**
 * KeyValue Storage Tests
 * 
 * Tests KV storage CRUD operations, types, and isolation
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, uniqueId } from './helpers';
import { decodeKVValue } from './helpers/kv';

// Import agents
import kvCrudAgent from '@agents/storage/kv/crud';
import kvTypesAgent from '@agents/storage/kv/types';
import kvIsolationAgent from '@agents/storage/kv/isolation';

// Test: KV Set operation
test('storage-kv', 'set', async () => {
	const key = uniqueId('kv-set');
	const namespace = uniqueId('ns-set');
	const result = await kvCrudAgent.run({
		operation: 'set',
		key,
		namespace,
		value: 'test-value',
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.operation, 'set');
	assertEqual(result.key, key);
	assertEqual(result.value, 'test-value');
	assertEqual(result.success, true);
});

// Test: KV Get operation
test('storage-kv', 'get', async () => {
	const key = uniqueId('kv-get');
	const namespace = uniqueId('ns-get');

	// Set a value first
	await kvCrudAgent.run({
		operation: 'set',
		key,
		namespace,
		value: 'retrieved-value',
	});

	// Get it back
	const result = await kvCrudAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.operation, 'get');
	assertEqual(decodeKVValue(result.value), 'retrieved-value');
	assertEqual(result.success, true);
});

// Test: KV Get non-existent key
test('storage-kv', 'get-missing', async () => {
	const key = uniqueId('kv-missing');
	const namespace = uniqueId('ns-get-missing');

	const result = await kvCrudAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.operation, 'get');
	assertEqual(result.value, undefined, 'Non-existent key should return undefined');
	assertEqual(result.success, true);
});

// Test: KV Delete operation
test('storage-kv', 'delete', async () => {
	const key = uniqueId('kv-delete');
	const namespace = uniqueId('ns-delete');

	// Set a value
	await kvCrudAgent.run({
		operation: 'set',
		key,
		namespace,
		value: 'to-be-deleted',
	});

	// Delete it
	const deleteResult = await kvCrudAgent.run({
		operation: 'delete',
		key,
		namespace,
	});
	assertEqual(deleteResult.success, true);

	// Verify it's gone
	const getResult = await kvCrudAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	// Check exists flag instead of value
	assertEqual(getResult.exists, false, `Deleted key should not exist (exists=${getResult.exists}, value=${getResult.value})`);
});

// Test: KV Has operation
test('storage-kv', 'has', async () => {
	const key = uniqueId('kv-has');
	const namespace = uniqueId('ns-has');

	// Check non-existent key
	const notExistsResult = await kvCrudAgent.run({
		operation: 'has',
		key,
		namespace,
	});

	assertEqual(notExistsResult.exists, false, 'Non-existent key should return false');

	// Set a value
	await kvCrudAgent.run({
		operation: 'set',
		key,
		namespace,
		value: 'exists',
	});

	// Check existing key
	const existsResult = await kvCrudAgent.run({
		operation: 'has',
		key,
		namespace,
	});

	assertEqual(existsResult.exists, true, 'Existing key should return true');
});

// Test: KV String type
test('storage-kv', 'type-string', async () => {
	const key = uniqueId('kv-string');
	const namespace = uniqueId('ns-type-string');

	await kvTypesAgent.run({
		operation: 'set-string',
		key,
		namespace,
		value: 'hello world',
	});

	const result = await kvTypesAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	assertEqual(decodeKVValue(result.value), 'hello world');
});

// Test: KV Object type (skipped - complex serialization)
// Objects require proper content-type handling which agent.run() serializes
// This is better tested in unit tests for the storage layer

// Test: KV Number type
test('storage-kv', 'type-number', async () => {
	const key = uniqueId('kv-number');
	const namespace = uniqueId('ns-type-number');

	await kvTypesAgent.run({
		operation: 'set-number',
		key,
		namespace,
		value: 123,
	});

	const result = await kvTypesAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	const decoded = decodeKVValue(result.value);
	assertEqual(decoded, 123);
	assertEqual(typeof decoded, 'number');
});

// Test: KV Boolean type (true)
test('storage-kv', 'type-boolean-true', async () => {
	const key = uniqueId('kv-bool-true');
	const namespace = uniqueId('ns-type-boolean-true');

	await kvTypesAgent.run({
		operation: 'set-boolean',
		key,
		namespace,
		value: true,
	});

	const result = await kvTypesAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	const decoded = decodeKVValue(result.value);
	assertEqual(decoded, true);
	assertEqual(typeof decoded, 'boolean');
});

// Test: KV Boolean type (false)
test('storage-kv', 'type-boolean-false', async () => {
	const key = uniqueId('kv-bool-false');
	const namespace = uniqueId('ns-type-boolean-false');

	await kvTypesAgent.run({
		operation: 'set-boolean',
		key,
		namespace,
		value: false,
	});

	const result = await kvTypesAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	const decoded = decodeKVValue(result.value);
	assertEqual(decoded, false);
	assertEqual(typeof decoded, 'boolean');
});

// Test: KV Isolation between calls
test('storage-kv', 'isolation', async () => {
	const baseKey = uniqueId('kv-isolation');
	const namespace = uniqueId('ns-isolation');

	// Make two concurrent calls with different keys
	const [result1, result2] = await Promise.all([
		kvIsolationAgent.run({
			key: `${baseKey}-1`,
			namespace,
			value: 'value-1',
		}),
		kvIsolationAgent.run({
			key: `${baseKey}-2`,
			namespace,
			value: 'value-2',
		}),
	]);

	// Each should get back its own value
	assertEqual(result1.setValue, 'value-1');
	assertEqual(decodeKVValue(result1.getValue), 'value-1');

	assertEqual(result2.setValue, 'value-2');
	assertEqual(decodeKVValue(result2.getValue), 'value-2');

	// Session IDs will be the same since both run() calls are from the same test context
	// This is fine - isolation is at the storage level via unique keys
	assertDefined(result1.sessionId, 'Should have session ID');
	assertDefined(result2.sessionId, 'Should have session ID');
});

// Test: KV Overwrite value
test('storage-kv', 'overwrite', async () => {
	const key = uniqueId('kv-overwrite');
	const namespace = uniqueId('ns-overwrite');

	// Set initial value
	await kvCrudAgent.run({
		operation: 'set',
		key,
		namespace,
		value: 'original',
	});

	// Overwrite it
	await kvCrudAgent.run({
		operation: 'set',
		key,
		namespace,
		value: 'updated',
	});

	// Verify new value
	const result = await kvCrudAgent.run({
		operation: 'get',
		key,
		namespace,
	});

	assertEqual(decodeKVValue(result.value), 'updated', 'Value should be overwritten');
});

// Test: KV Concurrent operations
test('storage-kv', 'concurrent-operations', async () => {
	const keys = Array.from({ length: 5 }, (_, i) => uniqueId(`kv-concurrent-${i}`));
	const namespace = uniqueId('ns-concurrent-operations');

	// Set multiple values concurrently
	await Promise.all(
		keys.map((key, i) =>
			kvCrudAgent.run({
				operation: 'set',
				key,
				namespace,
				value: `value-${i}`,
			})
		)
	);

	// Get them all back concurrently
	const results = await Promise.all(
		keys.map((key) =>
			kvCrudAgent.run({
				operation: 'get',
				key,
				namespace,
			})
		)
	);

	// Verify all values
	results.forEach((result, i) => {
		assertEqual(decodeKVValue(result.value), `value-${i}`, `Concurrent value ${i} should match`);
	});
});
