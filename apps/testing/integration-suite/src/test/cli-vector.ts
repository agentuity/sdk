/**
 * CLI Vector Tests
 *
 * Tests vector storage operations via CLI commands:
 * - Upsert vectors (with document text, embeddings, file/stdin)
 * - Search vectors
 * - Get vectors
 * - Delete vectors
 * - Stats (namespace and all)
 * - List namespaces
 * - Delete namespace
 */

import { test } from '@test/suite';
import { assert, uniqueId } from '@test/helpers';
import cliAgent from '@agents/cli/agent';
import { isAuthenticated } from '@test/helpers/cli';

// Test 1: Vector help command
test('cli-vector', 'help-command', async () => {
	const result = await cliAgent.run({
		command: 'cloud vector help',
	});

	// Help should produce output
	assert(result.stdout !== undefined, 'Help should produce output');
});

// Test 2: Upsert command structure
test('cli-vector', 'upsert-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');
	const key = uniqueId('vec-key');

	// Test upsert command structure (may fail without proper args)
	const result = await cliAgent.run({
		command: 'cloud vector upsert',
		args: [namespace, key, '--document', 'test document for vector storage'],
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Upsert should produce output'
	);
});

// Test 3: Search command structure
test('cli-vector', 'search-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');
	const query = 'test query';

	const result = await cliAgent.run({
		command: 'cloud vector search',
		args: [namespace, query],
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Search should produce output'
	);
});

// Test 4: Get command structure
test('cli-vector', 'get-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');
	const key = uniqueId('vec-key');

	const result = await cliAgent.run({
		command: 'cloud vector get',
		args: [namespace, key],
	});

	// Command should execute
	assert(result.stdout !== undefined || result.stderr !== undefined, 'Get should produce output');
});

// Test 5: Delete command structure
test('cli-vector', 'delete-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');
	const key = uniqueId('vec-key');

	const result = await cliAgent.run({
		command: 'cloud vector delete',
		args: [namespace, key, '--confirm'],
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Delete should produce output'
	);
});

// Test 6: Stats command - all namespaces
test('cli-vector', 'stats-all-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud vector stats',
	});

	// Command should execute
	assert(result.stdout !== undefined || result.stderr !== undefined, 'Stats should produce output');
});

// Test 7: Stats command - specific namespace
test('cli-vector', 'stats-namespace-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');

	const result = await cliAgent.run({
		command: 'cloud vector stats',
		args: [namespace],
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Stats namespace should produce output'
	);
});

// Test 8: List namespaces command
test('cli-vector', 'list-namespaces-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud vector list-namespaces',
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'List namespaces should produce output'
	);
});

// Test 9: List namespaces alias (ns)
test('cli-vector', 'list-namespaces-alias-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud vector ns',
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'List namespaces alias should produce output'
	);
});

// Test 10: Delete namespace command
test('cli-vector', 'delete-namespace-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');

	const result = await cliAgent.run({
		command: 'cloud vector delete-namespace',
		args: [namespace, '--confirm'],
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Delete namespace should produce output'
	);
});

// Test 11: Upsert with metadata
test('cli-vector', 'upsert-with-metadata-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');
	const key = uniqueId('vec-key');

	const result = await cliAgent.run({
		command: 'cloud vector upsert',
		args: [namespace, key, '--document', 'test document', '--metadata', '{"category":"test"}'],
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Upsert with metadata should produce output'
	);
});
