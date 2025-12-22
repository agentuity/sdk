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

// Test 2: Upsert command
test('cli-vector', 'upsert-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const namespace = uniqueId('vec-ns');
	const key = uniqueId('vec-key');

	const result = await cliAgent.run({
		command: 'cloud vector upsert',
		args: [namespace, key, '--document', 'test document for vector storage'],
		expectJSON: true,
	});

	// Command should succeed
	assert(result.exitCode === 0, `Upsert command failed with exit code ${result.exitCode}`);
	assert(result.json !== undefined, 'Upsert should return JSON output');
});

// Test 3: Search command
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
		expectJSON: true,
	});

	// Command should succeed (empty results is fine for non-existent namespace)
	assert(result.exitCode === 0, `Search command failed with exit code ${result.exitCode}`);
	assert(result.json !== undefined, 'Search should return JSON output');
});

// Test 4: Get command
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
		expectJSON: true,
	});

	// Command should succeed (not found is returned as JSON, not an error)
	assert(result.exitCode === 0, `Get command failed with exit code ${result.exitCode}`);
	assert(result.json !== undefined, 'Get should return JSON output');
});

// Test 5: Delete command
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
		expectJSON: true,
	});

	// Command should succeed (deleting non-existent key is idempotent)
	assert(result.exitCode === 0, `Delete command failed with exit code ${result.exitCode}`);
	assert(result.json !== undefined, 'Delete should return JSON output');
});

// Test 6: Stats command - all namespaces
test('cli-vector', 'stats-all-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud vector stats',
		expectJSON: true,
	});

	// Command should succeed
	assert(result.exitCode === 0, `Stats command failed with exit code ${result.exitCode}`);

	// JSON output should be valid and contain expected structure (object with namespace keys or empty)
	assert(result.json !== undefined, 'Stats should return JSON output');
	assert(typeof result.json === 'object', 'Stats JSON should be an object');
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
		expectJSON: true,
	});

	// Command should succeed
	assert(
		result.exitCode === 0,
		`Stats namespace command failed with exit code ${result.exitCode}`
	);

	// JSON output should contain namespace stats structure
	assert(result.json !== undefined, 'Stats namespace should return JSON output');
	assert(typeof result.json === 'object', 'Stats namespace JSON should be an object');
	assert('namespace' in result.json, 'Stats should include namespace field');
	assert('count' in result.json, 'Stats should include count field');
	assert('sum' in result.json, 'Stats should include sum field');
});

// Test 8: List namespaces command
test('cli-vector', 'list-namespaces-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud vector list-namespaces',
		expectJSON: true,
	});

	// Command should succeed
	assert(
		result.exitCode === 0,
		`List namespaces command failed with exit code ${result.exitCode}`
	);

	// JSON output should be an array of namespace strings
	assert(result.json !== undefined, 'List namespaces should return JSON output');
	assert(Array.isArray(result.json), 'List namespaces should return an array');
});

// Test 9: List namespaces alias (ns)
test('cli-vector', 'list-namespaces-alias-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud vector ns',
		expectJSON: true,
	});

	// Command should succeed
	assert(
		result.exitCode === 0,
		`List namespaces alias command failed with exit code ${result.exitCode}`
	);

	// JSON output should be an array (same as list-namespaces)
	assert(result.json !== undefined, 'List namespaces alias should return JSON output');
	assert(Array.isArray(result.json), 'List namespaces alias should return an array');
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
		expectJSON: true,
	});

	// Command should succeed
	assert(
		result.exitCode === 0,
		`Delete namespace command failed with exit code ${result.exitCode}`
	);

	// JSON output should confirm deletion
	assert(result.json !== undefined, 'Delete namespace should return JSON output');
	assert(typeof result.json === 'object', 'Delete namespace JSON should be an object');
	assert('success' in result.json, 'Delete namespace should include success field');
	assert('namespace' in result.json, 'Delete namespace should include namespace field');
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
		expectJSON: true,
	});

	// Command should succeed
	assert(
		result.exitCode === 0,
		`Upsert with metadata command failed with exit code ${result.exitCode}`
	);

	// JSON output should contain the upserted key and success indication
	assert(result.json !== undefined, 'Upsert with metadata should return JSON output');
	assert(typeof result.json === 'object', 'Upsert JSON should be an object');
	assert('success' in result.json, 'Upsert should include success field');
	assert('key' in result.json, 'Upsert should include key field');
	assert(
		result.json.key === key,
		`Upsert key should match: expected ${key}, got ${result.json.key}`
	);
});
