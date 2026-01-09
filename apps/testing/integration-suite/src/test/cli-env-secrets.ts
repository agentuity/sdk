/**
 * CLI Environment & Secrets Validation Tests
 *
 * Tests the validation rules for env commands:
 * - Reserved AGENTUITY_* keys (except AGENTUITY_PUBLIC_*) are blocked
 * - Public var prefixes (VITE_, AGENTUITY_PUBLIC_, PUBLIC_) cannot be secrets
 * - AGENTUITY_PUBLIC_* keys ARE allowed as env vars
 */

import { test } from '@test/suite';
import { assert, assertEqual } from '@test/helpers';
import cliAgent from '@agents/cli/agent';
import { isAuthenticated } from '@test/helpers/cli';

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

// Test: env list masks secrets by default
test('cli-env-secrets', 'env-list-masks-secrets-by-default', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = `MASK_TEST_${Date.now()}`;
	const testValue = 'super_secret_value_12345';

	// Set a secret (--secret flag must be in command string)
	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret`,
	});
	assert(
		setResult.success || setResult.stdout?.includes('set successfully'),
		`Set should succeed: ${setResult.stdout} ${setResult.stderr}`
	);

	// List without --no-mask - value should be masked
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});

	const lines = listResult.stdout?.split('\n') || [];
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(keyLine, `Key ${testKey} should be in list: ${listResult.stdout}`);
	assert(!keyLine.includes(testValue), 'Full secret value should NOT appear (should be masked)');
	assert(keyLine.includes('[secret]'), 'Should be marked as [secret]');

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

	const testKey = `NOMASK_TEST_${Date.now()}`;
	const testValue = 'visible_secret_value_67890';

	// Set a secret (--secret flag must be in command string)
	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret`,
	});
	assert(
		setResult.success || setResult.stdout?.includes('set successfully'),
		`Set should succeed: ${setResult.stdout} ${setResult.stderr}`
	);

	// List with --no-mask - value should be visible
	const listResult = await cliAgent.run({
		command: 'cloud env list --no-mask',
	});

	const lines = listResult.stdout?.split('\n') || [];
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(keyLine, `Key ${testKey} should be in list: ${listResult.stdout}`);
	assert(keyLine.includes(testValue), 'Full secret value should appear with --no-mask');

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

	const testKey = `AGENTUITY_PUBLIC_TEST_${Date.now()}`;
	const testValue = 'test_public_value';

	// 1. Set the AGENTUITY_PUBLIC_ prefixed var
	const setResult = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// Should succeed and not be blocked as reserved
	assert(
		setResult.success ||
			setResult.stdout?.includes('Setting') ||
			setResult.stdout?.includes('set successfully'),
		`Should allow AGENTUITY_PUBLIC_ as env var: ${setResult.stdout} ${setResult.stderr}`
	);
	assert(
		!setResult.stderr?.includes('reserved for system use') &&
			!setResult.stdout?.includes('reserved for system use'),
		'Should not reject AGENTUITY_PUBLIC_ as reserved'
	);

	// 2. List to verify it was actually added to cloud
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	assert(
		listResult.stdout?.includes(testKey),
		`List should include ${testKey}: ${listResult.stdout}`
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

	const testKey = `VITE_TEST_${Date.now()}`;
	const testValue = 'vite_test_value';

	const result = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// Should get past validation
	assert(
		result.success ||
			result.stdout?.includes('Setting') ||
			result.stdout?.includes('set successfully'),
		'Should allow VITE_ as env var'
	);

	// Verify with list
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	assert(listResult.stdout?.includes(testKey), `List should include ${testKey}`);

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

	const testKey = `PUBLIC_TEST_${Date.now()}`;
	const testValue = 'public_test_value';

	const result = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});

	// Should get past validation
	assert(
		result.success ||
			result.stdout?.includes('Setting') ||
			result.stdout?.includes('set successfully'),
		'Should allow PUBLIC_ as env var'
	);

	// Verify with list
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	assert(listResult.stdout?.includes(testKey), `List should include ${testKey}`);

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

	const testKey = `SECRET_KEY_${Date.now()}`;
	const testValue = 'secret_test_value';

	const result = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret`,
	});

	// Should get past validation to cloud operation
	assert(
		result.success ||
			result.stdout?.includes('Setting secret') ||
			result.stdout?.includes('set successfully'),
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
	const lines = listResult.stdout?.split('\n') || [];
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(keyLine && keyLine.includes('[secret]'), `${testKey} should be listed as secret`);

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

	const testKey = `MY_API_KEY_${Date.now()}`;
	const testValue = 'some_value';

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
	const lines = listResult.stdout?.split('\n') || [];
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(keyLine && keyLine.includes('[secret]'), `${testKey} should be listed as secret`);

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

	const testKey = `CONFIG_VAL_${Date.now()}`;
	// Long alphanumeric value (32+ chars) should trigger auto-detection
	const longValue = 'sk_test_1234567890abcdefghijklmnopqrstuvwxyz';

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
	const lines = listResult.stdout?.split('\n') || [];
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(keyLine && keyLine.includes('[secret]'), `${testKey} should be listed as secret`);

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

	const testKey = `NORMAL_VAR_${Date.now()}`;
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
		result.stdout?.includes('Setting') ||
			result.stdout?.includes('set successfully') ||
			result.success,
		'Should attempt to set the variable'
	);

	// Verify with list - should NOT be a secret
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	const lines = listResult.stdout?.split('\n') || [];
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(keyLine && !keyLine.includes('[secret]'), `${testKey} should NOT be a secret`);

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
	assert(output.includes('not found'), 'Should mention key not found');
});

// Test: Full CRUD cycle - set, get, list, delete, verify deleted
test('cli-env-secrets', 'env-crud-cycle', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = `CRUD_TEST_${Date.now()}`;
	const testValue = 'crud_test_value';

	// 1. Set
	const setResult = await cliAgent.run({
		command: 'cloud env set',
		args: [testKey, testValue],
	});
	assert(setResult.success, `Set should succeed: ${setResult.stderr}`);

	// 2. Get - verify value
	const getResult = await cliAgent.run({
		command: 'cloud env get',
		args: [testKey],
	});
	assert(getResult.success, `Get should succeed: ${getResult.stderr}`);
	assert(getResult.stdout?.includes(testValue), 'Get should return the value');

	// 3. List - verify key appears
	const listResult = await cliAgent.run({
		command: 'cloud env list',
	});
	assert(listResult.stdout?.includes(testKey), 'List should include the key');

	// 4. Delete
	const deleteResult = await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
	assert(deleteResult.success, `Delete should succeed: ${deleteResult.stderr}`);

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

	const testKey = `OVERWRITE_TEST_${Date.now()}`;
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
	assert(setResult.success, `Overwrite should succeed: ${setResult.stderr}`);

	// Get and verify new value
	const getResult = await cliAgent.run({
		command: 'cloud env get',
		args: [testKey],
	});
	assert(getResult.stdout?.includes(value2), 'Should return updated value');
	assert(!getResult.stdout?.includes(value1), 'Should not contain old value');

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});

// Test: Secret to env conversion - set as secret, then set as env
test('cli-env-secrets', 'env-secret-to-env-conversion', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = `CONVERT_TEST_${Date.now()}`;
	const value = 'convert_test_value';

	// Set as secret (flag must be in command string)
	const setSecretResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${value} --secret`,
	});
	assert(
		setSecretResult.success || setSecretResult.stdout?.includes('Secret'),
		`Set as secret should succeed: ${setSecretResult.stderr}`
	);

	// Verify it's a secret - check the specific line contains [secret]
	const listBefore = await cliAgent.run({
		command: 'cloud env list',
	});
	const linesBefore = listBefore.stdout?.split('\n') || [];
	const keyLineBefore = linesBefore.find((l) => l.includes(testKey));
	assert(
		keyLineBefore && keyLineBefore.includes('[secret]'),
		`Should be listed as secret: ${keyLineBefore || 'key not found'}`
	);

	// Now set same key as regular env (no --secret flag)
	await cliAgent.run({
		command: `cloud env set ${testKey} ${value}`,
	});

	// Verify it's now an env var (no [secret] tag)
	const listAfter = await cliAgent.run({
		command: 'cloud env list',
	});
	const linesAfter = listAfter.stdout?.split('\n') || [];
	const keyLineAfter = linesAfter.find((l) => l.includes(testKey));
	assert(
		keyLineAfter && !keyLineAfter.includes('[secret]'),
		`Should now be a regular env var: ${keyLineAfter || 'key not found'}`
	);

	// Cleanup
	await cliAgent.run({
		command: 'cloud env delete',
		args: [testKey],
	});
});
