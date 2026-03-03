/**
 * Vector Storage Tests
 *
 * Tests Vector storage operations including upsert, search, get, and delete
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, uniqueId } from './helpers';

import vectorCrudAgent from '@agents/storage/vector/crud';
import vectorSearchAgent from '@agents/storage/vector/search';

// Test: Upsert single vector
test('storage-vector', 'upsert-single', async () => {
	const namespace = uniqueId('vector-ns');
	const key = uniqueId('vector-key');

	const result = await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key,
		// No document - agent uses static default for cache efficiency
		metadata: { category: 'tech', topic: 'ml' },
	});

	assertEqual(result.operation, 'upsert-single');
	assertEqual(result.success, true);
	assertDefined(result.id, 'Should have ID');
	assertEqual(result.key, key);
});

// Test: Upsert multiple vectors
test('storage-vector', 'upsert-multiple', async () => {
	const namespace = uniqueId('vector-ns');
	const keys = [uniqueId('vec-1'), uniqueId('vec-2'), uniqueId('vec-3')];

	const result = await vectorCrudAgent.run({
		operation: 'upsert-multiple',
		namespace,
		keys,
		metadata: { batch: 'test' },
	});

	assertEqual(result.success, true);
	assertDefined(result.ids);
	assertEqual(result.ids!.length, 3, 'Should have 3 IDs');
});

// Test: Get vector by key
test('storage-vector', 'get', async () => {
	const namespace = uniqueId('vector-ns');
	const key = uniqueId('vector-key');

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key,
		// No document - uses static default
		metadata: { test: 'get' },
	});

	const result = await vectorCrudAgent.run({
		operation: 'get',
		namespace,
		key,
	});

	assertEqual(result.success, true);
	assertEqual(result.exists, true);
	assertDefined(result.data);
});

// Test: Get non-existent vector
test('storage-vector', 'get-missing', async () => {
	const namespace = uniqueId('vector-ns');
	const key = uniqueId('missing-key');

	const result = await vectorCrudAgent.run({
		operation: 'get',
		namespace,
		key,
	});

	assertEqual(result.success, true);
	assertEqual(result.exists, false);
});

// Test: Get many vectors
test('storage-vector', 'get-many', async () => {
	const namespace = uniqueId('vector-ns');
	const keys = [uniqueId('vec-1'), uniqueId('vec-2')];

	await vectorCrudAgent.run({
		operation: 'upsert-multiple',
		namespace,
		keys,
	});

	const result = await vectorCrudAgent.run({
		operation: 'get-many',
		namespace,
		keys,
	});

	assertEqual(result.success, true);
	assertDefined(result.data);
});

// Test: Search vectors
test('storage-vector', 'search-basic', async () => {
	const namespace = uniqueId('vector-ns');

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key: uniqueId('doc-1'),
		// Uses static default document
		metadata: { category: 'furniture' },
	});

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key: uniqueId('doc-2'),
		// Uses static default document
		metadata: { category: 'furniture' },
	});

	const result = await vectorSearchAgent.run({
		namespace,
		// No query - uses static default for cache efficiency
		limit: 5,
	});

	assertEqual(result.success, true);
	assertDefined(result.results);
	assert(result.count >= 0, 'Should have count');
});

// Test: Search with similarity threshold
test('storage-vector', 'search-similarity', async () => {
	const namespace = uniqueId('vector-ns');

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key: uniqueId('doc'),
		// Uses static default document
	});

	const result = await vectorSearchAgent.run({
		namespace,
		// No query - uses static default
		limit: 10,
		similarity: 0.5,
	});

	assertEqual(result.success, true);
	assertDefined(result.results);
});

// Test: Search with metadata filter
test('storage-vector', 'search-metadata-filter', async () => {
	const namespace = uniqueId('vector-ns');

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key: uniqueId('doc-1'),
		// Uses static default document
		metadata: { inStock: true, category: 'electronics' },
	});

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key: uniqueId('doc-2'),
		// Uses static default document
		metadata: { inStock: false, category: 'electronics' },
	});

	const result = await vectorSearchAgent.run({
		namespace,
		// No query - uses static default
		metadata: { inStock: true },
	});

	assertEqual(result.success, true);
	assertDefined(result.results);
});

// Test: Delete vector
test('storage-vector', 'delete', async () => {
	const namespace = uniqueId('vector-ns');
	const key = uniqueId('to-delete');

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key,
		// Uses static default document
	});

	const deleteResult = await vectorCrudAgent.run({
		operation: 'delete',
		namespace,
		key,
	});

	assertEqual(deleteResult.success, true);
	assertEqual(deleteResult.deleted, 1);

	const getResult = await vectorCrudAgent.run({
		operation: 'get',
		namespace,
		key,
	});

	assertEqual(getResult.exists, false);
});

// Test: Delete many vectors
test('storage-vector', 'delete-many', async () => {
	const namespace = uniqueId('vector-ns');
	const keys = [uniqueId('vec-1'), uniqueId('vec-2'), uniqueId('vec-3')];

	await vectorCrudAgent.run({
		operation: 'upsert-multiple',
		namespace,
		keys,
	});

	const result = await vectorCrudAgent.run({
		operation: 'delete-many',
		namespace,
		keys,
	});

	assertEqual(result.success, true);
	assertEqual(result.deleted, 3);
});

// Test: Namespace exists
test('storage-vector', 'namespace-exists', async () => {
	const namespace = uniqueId('vector-ns');

	await vectorCrudAgent.run({
		operation: 'upsert-single',
		namespace,
		key: uniqueId('key'),
		// Uses static default document
	});

	const result = await vectorCrudAgent.run({
		operation: 'exists',
		namespace,
	});

	assertEqual(result.success, true);
	assertEqual(result.exists, true);
});

// Test: Concurrent vector operations
test('storage-vector', 'concurrent-operations', async () => {
	const namespace = uniqueId('vector-ns');
	const keys = Array.from({ length: 5 }, (_, i) => uniqueId(`concurrent-${i}`));

	const results = await Promise.all(
		keys.map((key, i) =>
			vectorCrudAgent.run({
				operation: 'upsert-single',
				namespace,
				key,
				// Uses static default document for all - leverages cache
				metadata: { index: i },
			})
		)
	);

	results.forEach((result, i) => {
		assertEqual(result.success, true, `Operation ${i} should succeed`);
		assertDefined(result.id, `Operation ${i} should have ID`);
	});
});
