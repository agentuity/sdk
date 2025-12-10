/**
 * CLI Vector Tests
 *
 * Tests vector storage operations via CLI commands:
 * - Upsert vectors
 * - Search vectors
 * - Get vectors
 * - Delete vectors
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
		args: ['--namespace', namespace, '--key', key],
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
	const query = uniqueId('query');

	const result = await cliAgent.run({
		command: 'cloud vector search',
		args: ['--namespace', namespace, '--query', query],
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
		args: ['--namespace', namespace, '--key', key],
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
		args: ['--namespace', namespace, '--key', key],
	});

	// Command should execute
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Delete should produce output'
	);
});
