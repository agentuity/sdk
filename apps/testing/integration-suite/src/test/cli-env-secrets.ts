/**
 * CLI Environment & Secrets Validation Tests
 *
 * Tests the validation rules for env commands:
 * - Reserved AGENTUITY_* keys (except AGENTUITY_PUBLIC_*) are blocked
 * - Public var prefixes (VITE_, AGENTUITY_PUBLIC_, PUBLIC_) cannot be secrets
 * - AGENTUITY_PUBLIC_* keys ARE allowed as env vars
 */

import { test } from '@test/suite.ts';
import { assert, assertEqual, uniqueId, testRunId } from '@test/helpers/index.ts';
import cliAgent from '@agents/cli/agent.ts';
import { isAuthenticated } from '@test/helpers/cli.ts';

// Track all env vars created during tests for cleanup
const createdEnvVars: string[] = [];

// Helper to create and track env var keys
function trackKey(key: string): string {
	createdEnvVars.push(key);
	return key;
}

// Test: Reserved AGENTUITY_ key blocked for env set --secret
test('cli-env-secrets', 'env-set-secret-blocks-reserved-agentuity-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set AGENTUITY_SDK_KEY test_value --secret',
	});

	assertEqual(result.success, false, 'Should reject reserved AGENTUITY_ key');
	assert(
		result.stderr?.includes('reserved for system use') ||
			result.stdout?.includes('reserved for system use') ||
			false,
		'Should mention reserved for system use'
	);
});

// Test: VITE_ prefix blocked as secret
test('cli-env-secrets', 'env-set-secret-blocks-vite-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set VITE_API_KEY test_value --secret',
	});

	assertEqual(result.success, false, 'Should reject VITE_ as secret');
	assert(
		result.stderr?.includes('public variables as secrets') ||
			result.stdout?.includes('public variables as secrets') ||
			false,
		'Should mention public variables cannot be secrets'
	);
});

// Test: PUBLIC_ prefix blocked as secret
test('cli-env-secrets', 'env-set-secret-blocks-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set PUBLIC_URL test_value --secret',
	});

	assertEqual(result.success, false, 'Should reject PUBLIC_ as secret');
	assert(
		result.stderr?.includes('public variables as secrets') ||
			result.stdout?.includes('public variables as secrets') ||
			false,
		'Should mention public variables cannot be secrets'
	);
});

// Test: AGENTUITY_PUBLIC_ prefix blocked as secret
test('cli-env-secrets', 'env-set-secret-blocks-agentuity-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set AGENTUITY_PUBLIC_KEY test_value --secret',
	});

	assertEqual(result.success, false, 'Should reject AGENTUITY_PUBLIC_ as secret');
	assert(
		result.stderr?.includes('public variables as secrets') ||
			result.stdout?.includes('public variables as secrets') ||
			false,
		'Should mention public variables cannot be secrets'
	);
});

// Test: Reserved AGENTUITY_ key blocked for env set
test('cli-env-secrets', 'env-set-blocks-reserved-agentuity-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set AGENTUITY_SDK_KEY test_value',
	});

	assertEqual(result.success, false, 'Should reject reserved AGENTUITY_ key');
	assert(
		result.stderr?.includes('reserved for system use') ||
			result.stdout?.includes('reserved for system use') ||
			false,
		'Should mention reserved for system use'
	);
});

// Test: Whitelisted AGENTUITY_AUTH_SECRET allowed for env set
test('cli-env-secrets', 'env-set-allows-whitelisted-agentuity-auth-secret', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testValue = `auth_secret_test_${Date.now()}`;

	// AGENTUITY_AUTH_SECRET is whitelisted, should be allowed
	const result = await cliAgent.run({
		command: `cloud env set AGENTUITY_AUTH_SECRET ${testValue}`,
	});

	const output = (result.stdout || '') + (result.stderr || '');

	// Should NOT be blocked as reserved
	assert(
		!output.includes('reserved for system use'),
		'Should NOT reject whitelisted AGENTUITY_AUTH_SECRET as reserved'
	);

	// Should succeed or at least get past validation
	// Note: Due to _SECRET suffix, auto-detection may prompt and store as secret (default Y in non-TTY)
	assert(
		output.includes('set successfully') || output.includes('Setting') || result.success === true,
		`Should allow AGENTUITY_AUTH_SECRET: ${output}`
	);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete AGENTUITY_AUTH_SECRET',
	});
});

// Test: Whitelisted AGENTUITY_AUTH_SECRET allowed for env set --secret
test('cli-env-secrets', 'env-set-secret-allows-whitelisted-agentuity-auth-secret', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testValue = `auth_secret_test_${Date.now()}`;

	// AGENTUITY_AUTH_SECRET is whitelisted, should be allowed as secret
	const result = await cliAgent.run({
		command: `cloud env set AGENTUITY_AUTH_SECRET ${testValue} --secret`,
	});

	const output = (result.stdout || '') + (result.stderr || '');

	// Should NOT be blocked as reserved
	assert(
		!output.includes('reserved for system use'),
		'Should NOT reject whitelisted AGENTUITY_AUTH_SECRET as reserved'
	);

	// Should succeed
	assert(
		output.includes('set successfully') ||
			output.includes('Setting secret') ||
			result.success === true,
		`Should allow AGENTUITY_AUTH_SECRET as secret: ${output}`
	);

	// Verify it's stored as secret
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes('AGENTUITY_AUTH_SECRET'));
	assert(
		Boolean(keyLine && keyLine.includes('[secret]')),
		`AGENTUITY_AUTH_SECRET should be listed as secret: ${keyLine || 'not found'}`
	);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete AGENTUITY_AUTH_SECRET',
	});
});

// Test: env list masks secrets by default
test('cli-env-secrets', 'env-list-masks-secrets-by-default', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('MASK_TEST'));
	const testValue = 'super_secret_value_12345';

	// Set a secret (--secret flag must be in command string)
	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret`,
	});
	assert(
		Boolean(setResult.success || setResult.stdout?.includes('set successfully')),
		`Set should succeed: ${setResult.stdout} ${setResult.stderr}`
	);

	// List without --no-mask - value should be masked
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});

	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(Boolean(keyLine), `Key ${testKey} should be in list: ${listOutput}`);
	assert(!keyLine!.includes(testValue), 'Full secret value should NOT appear (should be masked)');
	assert(keyLine!.includes('[secret]'), 'Should be marked as [secret]');

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: env list --no-mask shows full secret values
test('cli-env-secrets', 'env-list-no-mask-shows-secrets', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('NOMASK_TEST'));
	const testValue = 'visible_secret_value_67890';

	// Set a secret (--secret flag must be in command string)
	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret`,
	});
	assert(
		Boolean(setResult.success || setResult.stdout?.includes('set successfully')),
		`Set should succeed: ${setResult.stdout} ${setResult.stderr}`
	);

	// List with --no-mask - value should be visible
	const listResult = await cliAgent.run({
		command: 'cloud env list --no-mask',
	});

	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(Boolean(keyLine), `Key ${testKey} should be in list: ${listOutput}`);
	assert(keyLine!.includes(testValue), 'Full secret value should appear with --no-mask');

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: AGENTUITY_PUBLIC_ allowed for env set and persists to cloud
test('cli-env-secrets', 'env-set-allows-agentuity-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(`AGENTUITY_PUBLIC_${uniqueId('TEST')}`);
	const testValue = 'test_public_value';

	// 1. Set the AGENTUITY_PUBLIC_ prefixed var
	const setResult = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// Should succeed and not be blocked as reserved
	const setOutput = (setResult.stdout || '') + (setResult.stderr || '');
	assert(
		Boolean(
			setResult.success ||
				setOutput.includes('Setting') ||
				setOutput.includes('set successfully')
		),
		`Should allow AGENTUITY_PUBLIC_ as env var: ${setOutput}`
	);
	assert(
		!setOutput.includes('reserved for system use'),
		'Should not reject AGENTUITY_PUBLIC_ as reserved'
	);

	// 2. Get to verify it was actually added (more reliable than list)
	const getResult = await cliAgent.run({
		command: 'cloud env get',
		args: [testKey],
	});
	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	assert(
		Boolean(getResult.success || getOutput.includes(testValue)),
		`Get should find ${testKey}: ${getOutput}`
	);

	// 3. Clean up - delete the test var
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: VITE_ allowed for env set
test('cli-env-secrets', 'env-set-allows-vite-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(`VITE_${uniqueId('TEST')}`);
	const testValue = 'vite_test_value';

	const result = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// Should get past validation
	assert(
		Boolean(
			result.success ||
				result.stdout?.includes('Setting') ||
				result.stdout?.includes('set successfully')
		),
		'Should allow VITE_ as env var'
	);

	// Verify with list
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	assert(Boolean(listOutput.includes(testKey)), `List should include ${testKey}`);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: PUBLIC_ allowed for env set
test('cli-env-secrets', 'env-set-allows-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(`PUBLIC_${uniqueId('TEST')}`);
	const testValue = 'public_test_value';

	const result = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// Should get past validation
	assert(
		Boolean(
			result.success ||
				result.stdout?.includes('Setting') ||
				result.stdout?.includes('set successfully')
		),
		'Should allow PUBLIC_ as env var'
	);

	// Verify with list
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	assert(Boolean(listOutput.includes(testKey)), `List should include ${testKey}`);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: Valid secret key should work (at least get past validation)
test('cli-env-secrets', 'env-set-secret-allows-valid-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('SECRET_KEY'));
	const testValue = 'secret_test_value';

	const result = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret`,
	});

	// Should get past validation to cloud operation
	assert(
		Boolean(
			result.success ||
				result.stdout?.includes('Setting secret') ||
				result.stdout?.includes('set successfully')
		),
		'Should allow valid secret key'
	);
	// Should NOT contain validation errors
	assert(
		!result.stderr?.includes('reserved for system use') &&
			!result.stdout?.includes('reserved for system use') &&
			!result.stderr?.includes('public variables as secrets') &&
			!result.stdout?.includes('public variables as secrets'),
		'Should not reject valid secret key'
	);

	// Verify with list - should show as [secret]
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLine && keyLine.includes('[secret]')),
		`${testKey} should be listed as secret`
	);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: Auto-detection prompts and stores as secret (default Y in non-TTY)
test('cli-env-secrets', 'env-set-auto-detects-secret-by-key-name', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	// Key must end with _KEY to trigger auto-detection (pattern: /_KEY$/i)
	// Use uniqueId in the value to avoid collisions, but keep key ending with _KEY
	const testKey = trackKey(`TEST_${uniqueId('').toUpperCase()}_KEY`);
	const testValue = `test_value_${Date.now()}`;

	// Key name pattern (_KEY suffix) should trigger auto-detection
	const result = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// In non-TTY mode, confirm() returns true (default), so it stores as secret
	const output = (result.stdout || '') + (result.stderr || '');
	assert(output.includes('looks like it should be a secret'), 'Should warn about secret-like key');
	// Should proceed with setting (as secret due to default Y)
	assert(
		output.includes('Setting secret') || output.includes('set successfully'),
		'Should proceed to set the value'
	);

	// Verify with list - should be stored as secret
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLine && keyLine.includes('[secret]')),
		`${testKey} should be listed as secret`
	);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: Auto-detection prompts and stores as secret (default Y in non-TTY)
test('cli-env-secrets', 'env-set-auto-detects-secret-by-value', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('CONFIG_VAL'));
	// Long alphanumeric value (32+ chars) should trigger auto-detection
	const longValue = 'test_secret_abcdefghij1234567890xyz';

	const result = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, longValue],
	});

	// In non-TTY mode, confirm() returns true (default), so it stores as secret
	const output = (result.stdout || '') + (result.stderr || '');
	assert(
		output.includes('looks like it should be a secret'),
		'Should warn about secret-like value'
	);
	// Should proceed with setting (as secret due to default Y)
	assert(
		output.includes('Setting secret') || output.includes('set successfully'),
		'Should proceed to set the value'
	);

	// Verify with list - should be stored as secret
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLine && keyLine.includes('[secret]')),
		`${testKey} should be listed as secret`
	);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: No auto-detection warning for normal env vars
test('cli-env-secrets', 'env-set-no-warning-for-normal-vars', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('NORMAL_VAR'));
	const testValue = 'normal_value';

	// Normal key and value should not trigger auto-detection
	const result = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// Should NOT contain secret detection warning
	assert(
		!result.stdout?.includes('looks like it should be a secret') &&
			!result.stderr?.includes('looks like it should be a secret'),
		'Should not warn about normal env var'
	);

	// Should proceed to setting the variable
	assert(
		Boolean(
			result.stdout?.includes('Setting') ||
				result.stdout?.includes('set successfully') ||
				result.success
		),
		'Should attempt to set the variable'
	);

	// Verify with list - should NOT be a secret
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(Boolean(keyLine && !keyLine.includes('[secret]')), `${testKey} should NOT be a secret`);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: env get returns not found for non-existent key
test('cli-env-secrets', 'env-get-not-found', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env get NON_EXISTENT_KEY_12345',
	});

	assertEqual(result.success, false, 'Should fail for non-existent key');
	const output = (result.stdout || '') + (result.stderr || '');
	assert(output.includes('not found'), 'Should mention key not found');
});

// Test: env delete returns not found for non-existent key
test('cli-env-secrets', 'env-delete-not-found', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env delete NON_EXISTENT_KEY_12345',
	});

	assertEqual(result.success, false, 'Should fail for non-existent key');
	const output = (result.stdout || '') + (result.stderr || '');
	assert(
		output.includes('not found') || output.includes('No variables found'),
		'Should mention key not found'
	);
});

// Test: Full CRUD cycle - set, get, list, delete, verify deleted
test('cli-env-secrets', 'env-crud-cycle', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('CRUD_TEST'));
	const testValue = 'crud_test_value';

	// 1. Set
	const setResult = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});
	assert(Boolean(setResult.success), `Set should succeed: ${setResult.stderr}`);

	// 2. Get - verify value
	const getResult = await cliAgent.run({
		command: 'cloud env get',
		args: [testKey],
	});
	// Debug: Check all output
	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	assert(
		Boolean(getResult.success),
		`Get should succeed: stdout=${getResult.stdout}, stderr=${getResult.stderr}, exitCode=${getResult.exitCode}`
	);
	assert(
		Boolean(getOutput.includes(testValue)),
		`Get should return the value. output=[${getOutput}], testValue=[${testValue}]`
	);

	// 3. List - verify key appears
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	assert(Boolean(listOutput.includes(testKey)), 'List should include the key');

	// 4. Delete
	const deleteResult = await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
	assert(Boolean(deleteResult.success), `Delete should succeed: ${deleteResult.stderr}`);

	// 5. Verify deleted - get should fail
	const verifyResult = await cliAgent.run({
		command: 'cloud env get',
		args: [testKey],
	});
	assertEqual(verifyResult.success, false, 'Get after delete should fail');
});

// Test: Overwrite - set same key twice updates value
test('cli-env-secrets', 'env-set-overwrite', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('OVERWRITE_TEST'));
	const value1 = 'first_value';
	const value2 = 'second_value';

	// Set initial value
	await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, value1],
	});

	// Overwrite with new value
	const setResult = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, value2],
	});
	assert(Boolean(setResult.success), `Overwrite should succeed: ${setResult.stderr}`);

	// Get and verify new value
	const getResult = await cliAgent.run({
		command: 'cloud env get',
		args: [testKey],
	});
	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	assert(
		Boolean(getOutput.includes(value2)),
		`Should return updated value. output: ${getOutput}, value2: ${value2}`
	);
	assert(!getOutput.includes(value1), 'Should not contain old value');

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: Re-setting a secret without --secret flag should preserve secret status
test('cli-env-secrets', 'env-secret-preserves-status-on-update', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('SECRET_PRESERVE_TEST'));
	const value1 = 'secret_value_1';
	const value2 = 'secret_value_2';

	// Set as secret
	const setSecretResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${value1} --secret`,
	});
	assert(
		Boolean(setSecretResult.success || setSecretResult.stdout?.includes('Secret')),
		`Set as secret should succeed: ${setSecretResult.stderr}`
	);

	// Verify it's a secret
	const listBefore = await cliAgent.run({
		command: 'cloud env list',
	});
	const listBeforeOutput = (listBefore.stdout || '') + (listBefore.stderr || '');
	const linesBefore = listBeforeOutput.split('\n');
	const keyLineBefore = linesBefore.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLineBefore && keyLineBefore.includes('[secret]')),
		`Should be listed as secret initially: ${keyLineBefore || 'key not found'}`
	);

	// Re-set same key with new value but WITHOUT --secret flag
	await cliAgent.run({
		command: `cloud env set ${testKey} ${value2}`,
	});

	// Verify it's STILL a secret (secret status should be preserved)
	const listAfter = await cliAgent.run({
		command: 'cloud env list',
	});
	const listAfterOutput = (listAfter.stdout || '') + (listAfter.stderr || '');
	const linesAfter = listAfterOutput.split('\n');
	const keyLineAfter = linesAfter.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLineAfter && keyLineAfter.includes('[secret]')),
		`Should still be a secret after update without --secret flag: ${keyLineAfter || 'key not found'}`
	);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: Reserved AGENTUITY_ key blocked for env delete
test('cli-env-secrets', 'env-delete-blocks-reserved-agentuity-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env delete AGENTUITY_SDK_KEY',
	});

	assertEqual(result.success, false, 'Should reject deleting reserved AGENTUITY_ key');
	assert(
		result.stderr?.includes('reserved for system use') ||
			result.stdout?.includes('reserved for system use') ||
			false,
		'Should mention reserved for system use'
	);
});

// Test: Public vars with secret-like values are stored as env (not promoted to secret)
// This tests that VITE_* vars don't trigger the auto-detect secret prompt
test('cli-env-secrets', 'env-set-public-var-with-secret-value-stays-env', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(`VITE_TEST_${uniqueId('KEY')}`);
	// Use a value that looks secret-like to humans but doesn't match known API key
	// prefixes (sk_live_, ghp_, AKIA, etc.) that the server may auto-promote to secrets.
	// Keep under 32 chars to avoid the generic long-string secret heuristic.
	const secretLikeValue = 'my_secret_value_12345678'; // 24 chars, not a known secret pattern

	// Set a VITE_ var with a secret-like value (should NOT prompt, should stay as env)
	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} "${secretLikeValue}"`,
	});

	// Should succeed (public vars skip auto-detect)
	assert(
		Boolean(setResult.success || setResult.stdout?.includes('set successfully')),
		`Set should succeed: ${setResult.stdout} ${setResult.stderr}`
	);

	// Verify it's stored as env var, NOT as secret
	const getResult = await cliAgent.run({
		command: `cloud env get ${testKey}`,
	});

	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	// Should NOT be marked as secret (output uses "(secret)" label)
	assert(!getOutput.includes('(secret)'), 'Public var should NOT be marked as secret');
	// Value should be visible (not masked)
	assert(getOutput.includes(secretLikeValue), 'Value should be visible (not masked)');

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: PUBLIC_ prefix with secret-like value stays as env
test('cli-env-secrets', 'env-set-public-prefix-with-secret-value-stays-env', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(`PUBLIC_TEST_${uniqueId('TOKEN')}`);
	// Use a value that looks secret-like to humans but doesn't match known API key
	// prefixes (sk_live_, ghp_, AKIA, etc.) that the server may auto-promote to secrets.
	// Keep under 32 chars to avoid the generic long-string secret heuristic.
	const secretLikeValue = 'my_secret_token_87654321'; // 24 chars, not a known secret pattern

	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} "${secretLikeValue}"`,
	});

	assert(
		Boolean(setResult.success || setResult.stdout?.includes('set successfully')),
		`Set should succeed: ${setResult.stdout} ${setResult.stderr}`
	);

	// Verify it's stored as env var, NOT as secret
	const getResult = await cliAgent.run({
		command: `cloud env get ${testKey}`,
	});

	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	// Output uses "(secret)" label, not "[secret]"
	assert(!getOutput.includes('(secret)'), 'PUBLIC_ var should NOT be marked as secret');

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Final cleanup test - runs last to clean up any leftover env vars
test('cli-env-secrets', 'zzz-cleanup-all-env-vars', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	// Only delete env vars created by THIS test run (identified by testRunId)
	// This prevents concurrent CI runs from interfering with each other
	const keysToDelete = [...createdEnvVars];

	if (keysToDelete.length === 0) {
		return;
	}

	// Delete all test env vars from this run in a single batch operation
	await cliAgent.run({
		command: 'cloud env delete',
		args: keysToDelete,
	});

	// Clear the tracking array
	createdEnvVars.length = 0;
});
