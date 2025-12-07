/**
 * Nested Agent Directory Tests
 *
 * Tests that agents in nested directories are properly discovered,
 * registered, and can be executed with TypeScript support.
 */

import { test } from '@test/suite';
import { assertEqual, assertDefined, assert } from '@test/helpers';
import dataAgent from '@agents/v1/data/agent';
import helperAgent from '@agents/utils/helpers/agent';

// Test: V1 data agent - create operation
test('agent-nested', 'v1-data-create', async () => {
	const result = await dataAgent.run({
		operation: 'create',
		data: 'test-value',
	});

	assertEqual(result.success, true);
	assertDefined(result.result);
	assert(typeof result.result === 'object', 'Result should be an object');
	assert('id' in result.result, 'Result should have id field');
	assert('value' in result.result, 'Result should have value field');
	assert('timestamp' in result.result, 'Result should have timestamp field');
});

// Test: V1 data agent - process operation
test('agent-nested', 'v1-data-process', async () => {
	const testData = { key: 'value', count: 42 };
	const result = await dataAgent.run({
		operation: 'process',
		data: testData,
	});

	assertEqual(result.success, true);
	assertDefined(result.result);
	assert(result.result.processed === true, 'Should be marked as processed');
	assert(result.result.data.key === 'value', 'Should preserve input data');
});

// Test: V1 data agent - unknown operation
test('agent-nested', 'v1-data-unknown', async () => {
	const result = await dataAgent.run({
		operation: 'unknown',
	});

	assertEqual(result.success, false);
});

// Test: Utils helper agent - uppercase transform
test('agent-nested', 'utils-helper-uppercase', async () => {
	const result = await helperAgent.run({
		text: 'hello world',
		transform: 'uppercase',
	});

	assertEqual(result.result, 'HELLO WORLD');
	assertDefined(result.metadata);
	assert(result.metadata.type === 'uppercase', 'Type should be uppercase');
	assertEqual(result.metadata.original, 'hello world');
});

// Test: Utils helper agent - lowercase transform
test('agent-nested', 'utils-helper-lowercase', async () => {
	const result = await helperAgent.run({
		text: 'HELLO WORLD',
		transform: 'lowercase',
	});

	assertEqual(result.result, 'hello world');
	assertEqual(result.metadata.type, 'lowercase');
});

// Test: Utils helper agent - capitalize transform
test('agent-nested', 'utils-helper-capitalize', async () => {
	const result = await helperAgent.run({
		text: 'hello world',
		transform: 'capitalize',
	});

	assertEqual(result.result, 'Hello world');
	assertEqual(result.metadata.type, 'capitalize');
});

// Test: Utils helper agent - reverse transform
test('agent-nested', 'utils-helper-reverse', async () => {
	const result = await helperAgent.run({
		text: 'hello',
		transform: 'reverse',
	});

	assertEqual(result.result, 'olleh');
	assertEqual(result.metadata.type, 'reverse');
});

// Test: TypeScript interfaces work in nested agents
test('agent-nested', 'typescript-interfaces', async () => {
	// The v1/data/agent.ts uses DataRecord interface
	const createResult = await dataAgent.run({
		operation: 'create',
		data: 'interface-test',
	});

	assertEqual(createResult.success, true);

	// The utils/helpers/agent.ts uses enums and type aliases
	const transformResult = await helperAgent.run({
		text: 'enum-test',
		transform: 'uppercase',
	});

	assertEqual(transformResult.result, 'ENUM-TEST');

	// If we got here, TypeScript compilation worked correctly
	assert(true, 'Nested agents with TypeScript types executed successfully');
});

// Test: Agents can be imported using path aliases
test('agent-nested', 'path-alias-imports', async () => {
	// Importing from @agents/v1/data/agent and @agents/utils/helpers/agent
	// proves that nested path resolution works

	assertDefined(dataAgent, 'V1 data agent should be imported');
	assertDefined(helperAgent, 'Utils helper agent should be imported');

	// Verify agents have correct metadata
	assert(
		dataAgent.metadata.name === 'v1-data-processor',
		'Data agent should have correct name'
	);
	assert(
		helperAgent.metadata.name === 'utils-string-helper',
		'Helper agent should have correct name'
	);
});
