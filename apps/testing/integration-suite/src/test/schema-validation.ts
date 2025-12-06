/**
 * Schema Validation Tests
 *
 * Tests various schema patterns: types, optional fields, defaults, nested objects, unions, arrays
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, assertThrows } from './helpers';

import schemaTypesAgent from '@agents/schema/types';
import schemaOptionalAgent from '@agents/schema/optional';
import schemaComplexAgent from '@agents/schema/complex';

// Test: Basic types validation
test('schema', 'basic-types', async () => {
	const result = await schemaTypesAgent.run({
		stringValue: 'hello',
		numberValue: 123,
		booleanValue: true,
		arrayValue: ['a', 'b', 'c'],
		objectValue: { nested: 'value' },
	});

	assertEqual(result.success, true);
	assertEqual(result.receivedTypes.string, 'string');
	assertEqual(result.receivedTypes.number, 'number');
	assertEqual(result.receivedTypes.boolean, 'boolean');
	assertEqual(result.receivedTypes.array, 'array');
	assertEqual(result.receivedTypes.object, 'object');
});

// Test: String type validation
test('schema', 'string-type', async () => {
	const result = await schemaTypesAgent.run({
		stringValue: 'test string',
		numberValue: 0,
		booleanValue: false,
		arrayValue: [],
		objectValue: { nested: '' },
	});

	assertEqual(result.receivedTypes.string, 'string');
});

// Test: Number type validation
test('schema', 'number-type', async () => {
	const result = await schemaTypesAgent.run({
		stringValue: '',
		numberValue: 999.99,
		booleanValue: true,
		arrayValue: [],
		objectValue: { nested: '' },
	});

	assertEqual(result.receivedTypes.number, 'number');
});

// Test: Array type validation
test('schema', 'array-type', async () => {
	const result = await schemaTypesAgent.run({
		stringValue: '',
		numberValue: 0,
		booleanValue: false,
		arrayValue: ['one', 'two', 'three'],
		objectValue: { nested: '' },
	});

	assertEqual(result.receivedTypes.array, 'array');
});

// Test: Optional field omitted
test('schema', 'optional-omitted', async () => {
	const result = await schemaOptionalAgent.run({
		required: 'present',
	});

	assertEqual(result.success, true);
	assertEqual(result.received.required, 'present');
	assertEqual(result.received.optional, undefined);
	assertEqual(result.received.withDefault, 42, 'Should use default value');
});

// Test: Optional field provided
test('schema', 'optional-provided', async () => {
	const result = await schemaOptionalAgent.run({
		required: 'present',
		optional: 'also present',
		withDefault: 100,
	});

	assertEqual(result.success, true);
	assertEqual(result.received.optional, 'also present');
	assertEqual(result.received.withDefault, 100);
});

// Test: Nested object schema
test('schema', 'nested-object', async () => {
	const result = await schemaComplexAgent.run({
		operation: 'nested-object',
		nested: {
			level1: {
				level2: {
					value: 'deeply nested',
				},
			},
		},
	});

	assertEqual(result.success, true);
	assertEqual(result.result, 'deeply nested');
});

// Test: Union type with string
test('schema', 'union-string', async () => {
	const result = await schemaComplexAgent.run({
		operation: 'union-string',
		union: 'string value',
	});

	assertEqual(result.success, true);
	assertEqual(result.result.value, 'string value');
	assertEqual(result.result.type, 'string');
});

// Test: Union type with number
test('schema', 'union-number', async () => {
	const result = await schemaComplexAgent.run({
		operation: 'union-number',
		union: 456,
	});

	assertEqual(result.success, true);
	assertEqual(result.result.value, 456);
	assertEqual(result.result.type, 'number');
});

// Test: Array of objects
test('schema', 'array-of-objects', async () => {
	const result = await schemaComplexAgent.run({
		operation: 'array-of-objects',
		arrayOfObjects: [
			{ id: 'item-1', count: 10 },
			{ id: 'item-2', count: 20 },
			{ id: 'item-3', count: 30 },
		],
	});

	assertEqual(result.success, true);
	assertEqual(result.result.count, 3);
	assertDefined(result.result.items);
});

// Test: Empty array
test('schema', 'empty-array', async () => {
	const result = await schemaComplexAgent.run({
		operation: 'array-of-objects',
		arrayOfObjects: [],
	});

	assertEqual(result.success, true);
	assertEqual(result.result.count, 0);
});

// Test: Record type
test('schema', 'record-type', async () => {
	const result = await schemaComplexAgent.run({
		operation: 'record-type',
		record: {
			key1: 'value1',
			key2: 123,
			key3: true,
		},
	});

	assertEqual(result.success, true);
	assertDefined(result.result);
	assertEqual(result.result.key1, 'value1');
});

// Test: Empty record
test('schema', 'empty-record', async () => {
	const result = await schemaComplexAgent.run({
		operation: 'record-type',
		record: {},
	});

	assertEqual(result.success, true);
	assertDefined(result.result);
});

// Test: Missing required nested field throws
test('schema', 'missing-nested-required', async () => {
	await assertThrows(async () => {
		await schemaComplexAgent.run({
			operation: 'nested-object',
			nested: {
				level1: {} as any,
			},
		});
	}, 'Should throw for missing nested required field');
});

// Test: Invalid array item type throws
test('schema', 'invalid-array-item', async () => {
	await assertThrows(async () => {
		await schemaComplexAgent.run({
			operation: 'array-of-objects',
			arrayOfObjects: [{ id: 'valid', count: 10 }, { id: 'invalid' } as any],
		});
	}, 'Should throw for invalid array item');
});
