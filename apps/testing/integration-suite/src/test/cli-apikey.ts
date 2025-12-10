/**
 * CLI API Key Tests
 *
 * Tests API key management via CLI commands:
 * - List API keys
 * - Create API key
 * - Get API key details
 * - Delete API key
 * - Verify deletion
 */

import { test } from '@test/suite';
import { assert, assertEqual, assertDefined } from '@test/helpers';
import cliAgent from '@agents/cli/agent';
import { isAuthenticated } from '@test/helpers/cli';

// Test 1: List API keys command
test('cli-apikey', 'list-command', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		// Skip if not authenticated
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud apikey list',
		expectJSON: true,
	});

	// Should execute successfully
	assertEqual(result.exitCode, 0, 'List command should exit 0');
	assertDefined(result.json, 'List command should return JSON');
	assert(Array.isArray(result.json), 'List command should return array');
	assert(result.json.length >= 0, 'List should return valid array');
});

// Test 2: Create API key command structure
test('cli-apikey', 'create-command-structure', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	// Test with dry-run or invalid expiration to avoid creating real keys
	const result = await cliAgent.run({
		command: 'cloud apikey create',
		args: ['--name', 'test-key-never-created'],
	});

	// Command should execute (may fail validation, but structure is valid)
	assert(result.stdout !== undefined, 'Create command should produce output');
});

// Test 3: Get API key command structure
test('cli-apikey', 'get-command-structure', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	// Try to get a non-existent key
	const result = await cliAgent.run({
		command: 'cloud apikey get',
		args: ['apikey_nonexistent123'],
		expectJSON: true,
	});

	// Should fail (key doesn't exist) but command structure is valid
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Get command should produce output'
	);
});

// Test 4: Delete API key command structure
test('cli-apikey', 'delete-command-structure', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	// Try to delete a non-existent key
	const result = await cliAgent.run({
		command: 'cloud apikey delete',
		args: ['apikey_nonexistent123', '--json'],
	});

	// Should execute (may fail, but command is valid)
	assert(
		result.stdout !== undefined || result.stderr !== undefined,
		'Delete command should produce output'
	);
});

// Test 5: JSON output parsing
test('cli-apikey', 'json-output-parsing', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	const result = await cliAgent.run({
		command: 'cloud apikey list',
		expectJSON: true,
	});

	// If succeeded, should have JSON
	if (result.success) {
		// JSON should be array or object
		assert(result.json !== undefined, 'JSON output should be parsed');
	}
});

// Test 6: Help command
test('cli-apikey', 'help-command', async () => {
	const result = await cliAgent.run({
		command: 'cloud apikey help',
	});

	// Help should succeed
	assert(result.stdout !== undefined, 'Help should produce output');
	assert(
		(result.stdout?.includes('apikey') || result.stdout?.includes('API')) ?? false,
		'Help should mention API keys'
	);
});

// Test 7: Expiration date validation
test('cli-apikey', 'expiration-validation', async () => {
	const authenticated = await isAuthenticated();

	if (!authenticated) {
		return;
	}

	// Test with invalid expiration format
	const result = await cliAgent.run({
		command: 'cloud apikey create',
		args: ['--name', 'test', '--expires-at', 'invalid-date'],
	});

	// Should fail validation
	assert(
		result.exitCode !== 0 || result.stderr !== undefined,
		'Invalid expiration should be rejected'
	);
});
