/**
 * Stream Storage Tests
 *
 * Tests Stream storage operations including create, write, read, metadata, and types
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, uniqueId } from './helpers';

import streamCrudAgent from '@agents/storage/stream/crud';
import streamMetadataAgent from '@agents/storage/stream/metadata';
import streamTypesAgent from '@agents/storage/stream/types';

// Test: Create stream, write, and close
test('storage-stream', 'create-write-close', async () => {
	const name = uniqueId('stream-basic');

	const result = await streamCrudAgent.run({
		operation: 'create-write-close',
		name,
		data: 'Hello, Stream!',
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.operation, 'create-write-close');
	assertDefined(result.streamId, 'Stream ID should be defined');
	assertDefined(result.url, 'Stream URL should be defined');
	assertEqual(result.success, true);
});

// Test: Create, write, and read back data
test('storage-stream', 'create-write-read', async () => {
	const name = uniqueId('stream-read');
	const testData = 'Test data for reading';

	const result = await streamCrudAgent.run({
		operation: 'create-write-read',
		name,
		data: testData,
	});

	assertDefined(result, 'Result should be defined');
	assertEqual(result.operation, 'create-write-read');
	assertEqual(result.data, testData, 'Read data should match written data');
	assertEqual(result.success, true);
});

// Test: Download stream by ID
test('storage-stream', 'download', async () => {
	const name = uniqueId('stream-download');
	const testData = 'Data to download';

	const createResult = await streamCrudAgent.run({
		operation: 'create-write-close',
		name,
		data: testData,
	});

	assertDefined(createResult.streamId, 'Stream ID should exist');

	const downloadResult = await streamCrudAgent.run({
		operation: 'download',
		streamId: createResult.streamId,
	});

	assertEqual(downloadResult.data, testData, 'Downloaded data should match');
	assertEqual(downloadResult.success, true);
});

// Test: Delete stream
test('storage-stream', 'delete', async () => {
	const name = uniqueId('stream-delete');

	const createResult = await streamCrudAgent.run({
		operation: 'create-write-close',
		name,
		data: 'To be deleted',
	});

	assertDefined(createResult.streamId);

	const deleteResult = await streamCrudAgent.run({
		operation: 'delete',
		streamId: createResult.streamId,
	});

	assertEqual(deleteResult.success, true);
});

// Test: Create stream with metadata
test('storage-stream', 'metadata', async () => {
	const name = uniqueId('stream-metadata');
	const metadata = {
		author: 'test-user',
		version: '1.0',
		category: 'test',
	};

	const result = await streamMetadataAgent.run({
		operation: 'create-with-metadata',
		name,
		metadata,
		contentType: 'text/plain',
	});

	assertDefined(result.streamId);
	assertEqual(result.name, name);
	assertDefined(result.metadata);
	assertEqual(result.metadata?.author, 'test-user');
	assertEqual(result.metadata?.version, '1.0');
	assertEqual(result.metadata?.category, 'test');
	assertEqual(result.success, true);
});

// Test: Get stream info
test('storage-stream', 'get-info', async () => {
	const name = uniqueId('stream-info');

	const createResult = await streamCrudAgent.run({
		operation: 'create-write-close',
		name,
		data: 'Info test data',
	});

	assertDefined(createResult.streamId);

	const infoResult = await streamMetadataAgent.run({
		operation: 'get',
		streamId: createResult.streamId,
	});

	assertEqual(infoResult.streamId, createResult.streamId);
	assertEqual(infoResult.name, name);
	assertDefined(infoResult.url);
	assertDefined(infoResult.sizeBytes);
	assert(infoResult.sizeBytes! > 0, 'Size should be greater than 0');
	assertEqual(infoResult.success, true);
});

// Test: List streams
test('storage-stream', 'list', async () => {
	const baseName = uniqueId('stream-list');

	await Promise.all([
		streamCrudAgent.run({
			operation: 'create-write-close',
			name: `${baseName}-1`,
			data: 'List test 1',
		}),
		streamCrudAgent.run({
			operation: 'create-write-close',
			name: `${baseName}-2`,
			data: 'List test 2',
		}),
	]);

	const listResult = await streamMetadataAgent.run({
		operation: 'list',
	});

	assertDefined(listResult.streams);
	assertDefined(listResult.total);
	assert(listResult.total! >= 0, 'Total should be at least 0');
	assertEqual(listResult.success, true);
});

// Test: String type stream
test('storage-stream', 'type-string', async () => {
	const name = uniqueId('stream-string');
	const testString = 'Hello, World!';

	const result = await streamTypesAgent.run({
		operation: 'write-string',
		name,
		data: testString,
	});

	assertEqual(result.data, testString);
	assertEqual(result.contentType, 'text/plain');
	assertEqual(result.success, true);
});

// Test: Binary type stream
test('storage-stream', 'type-binary', async () => {
	const name = uniqueId('stream-binary');
	const testData = 'Binary data test';

	const result = await streamTypesAgent.run({
		operation: 'write-binary',
		name,
		data: testData,
	});

	assertEqual(result.data, testData);
	assertEqual(result.contentType, 'application/octet-stream');
	assertEqual(result.success, true);
});

// Test: JSON object stream
test('storage-stream', 'type-json', async () => {
	const name = uniqueId('stream-json');
	const testObject = {
		id: 123,
		name: 'Test Object',
		active: true,
	};

	const result = await streamTypesAgent.run({
		operation: 'write-json',
		name,
		data: testObject,
	});

	assertDefined(result.data);
	assertEqual(typeof result.data, 'object');
	assertEqual((result.data as any).id, 123);
	assertEqual((result.data as any).name, 'Test Object');
	assertEqual((result.data as any).active, true);
	assertEqual(result.contentType, 'application/json');
	assertEqual(result.success, true);
});

// Test: Concurrent stream operations
test('storage-stream', 'concurrent-operations', async () => {
	const names = Array.from({ length: 5 }, (_, i) => uniqueId(`stream-concurrent-${i}`));

	const results = await Promise.all(
		names.map((name, i) =>
			streamCrudAgent.run({
				operation: 'create-write-close',
				name,
				data: `Concurrent data ${i}`,
			})
		)
	);

	results.forEach((result, i) => {
		assertDefined(result.streamId, `Stream ${i} should have ID`);
		assertEqual(result.success, true, `Stream ${i} should succeed`);
	});
});

// Test: Stream size validation
test('storage-stream', 'size-validation', async () => {
	const name = uniqueId('stream-size');
	const testData = 'A'.repeat(100);

	const createResult = await streamCrudAgent.run({
		operation: 'create-write-close',
		name,
		data: testData,
	});

	assertDefined(createResult.streamId);

	const infoResult = await streamMetadataAgent.run({
		operation: 'get',
		streamId: createResult.streamId,
	});

	assertDefined(infoResult.sizeBytes);
	assertEqual(infoResult.sizeBytes, 100, 'Size should match data length');
});
