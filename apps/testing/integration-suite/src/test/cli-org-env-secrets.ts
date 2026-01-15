/**
 * CLI Organization Environment & Secrets Validation Tests
 *
 * Tests the org-level env commands with --org flag:
 * - org-level env set/get/list/delete with --org flag
 * - Reserved AGENTUITY_* keys (except AGENTUITY_PUBLIC_*) are blocked
 * - Public var prefixes (VITE_, AGENTUITY_PUBLIC_, PUBLIC_) cannot be secrets
 * - Org-level variables are accessible across projects
 */

import { test } from '@test/suite';
import { assert, assertEqual, uniqueId } from '@test/helpers';
import cliAgent from '@agents/cli/agent';
import { isAuthenticated } from '@test/helpers/cli';

// Track all org env vars created during tests for cleanup
const createdOrgEnvVars: string[] = [];

// Helper to create and track env var keys
function trackKey(key: string): string {
	createdOrgEnvVars.push(key);
	return key;
}

// Test: org env set creates an org-level env variable
test('cli-org-env-secrets', 'org-env-set-creates-variable', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_ENV_TEST'));
	const testValue = 'org_test_value';

	const result = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --org`,
	});

	const output = (result.stdout || '') + (result.stderr || '');
	assert(
		Boolean(result.success || output.includes('set successfully')),
		`Org env set should succeed: ${output}`
	);
	assert(
		output.includes('Organization') || output.includes('org'),
		'Should indicate org-level operation'
	);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env set --secret creates an org-level secret
test('cli-org-env-secrets', 'org-env-set-secret-creates-secret', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_SECRET_TEST'));
	const testValue = 'org_secret_value';

	const result = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret --org`,
	});

	const output = (result.stdout || '') + (result.stderr || '');
	assert(
		Boolean(result.success || output.includes('set successfully')),
		`Org secret set should succeed: ${output}`
	);
	assert(
		output.includes('Organization') || output.includes('secret'),
		'Should indicate org-level secret operation'
	);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env get retrieves org-level variable
test('cli-org-env-secrets', 'org-env-get-retrieves-variable', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_GET_TEST'));
	const testValue = 'org_get_test_value';

	// Set the variable
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --org`,
	});

	// Get the variable
	const getResult = await cliAgent.run({
		command: `cloud env get ${testKey} --org`,
	});

	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	assert(getOutput.includes(testValue), `Should retrieve value: ${getOutput}`);
	assert(getOutput.includes('[org]'), 'Should indicate org scope');

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env list shows org-level variables
test('cli-org-env-secrets', 'org-env-list-shows-variables', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_LIST_TEST'));
	const testValue = 'org_list_test_value';

	// Set the variable
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --org`,
	});

	// List org variables
	const listResult = await cliAgent.run({
		command: 'cloud env list --org',
	});

	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	assert(listOutput.includes(testKey), `Should list key: ${listOutput}`);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env delete removes org-level variable
test('cli-org-env-secrets', 'org-env-delete-removes-variable', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_DELETE_TEST'));
	const testValue = 'org_delete_test_value';

	// Set the variable
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --org`,
	});

	// Delete the variable
	const deleteResult = await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});

	const deleteOutput = (deleteResult.stdout || '') + (deleteResult.stderr || '');
	assert(
		Boolean(deleteResult.success || deleteOutput.includes('deleted successfully')),
		`Delete should succeed: ${deleteOutput}`
	);

	// Verify deleted
	const getResult = await cliAgent.run({
		command: `cloud env get ${testKey} --org`,
	});
	assertEqual(getResult.success, false, 'Get after delete should fail');
});

// Test: org env list --no-mask shows unmasked secrets
test('cli-org-env-secrets', 'org-env-list-no-mask-shows-secrets', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_NOMASK_TEST'));
	const testValue = 'visible_org_secret_12345';

	// Set a secret
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret --org`,
	});

	// List with --no-mask
	const listResult = await cliAgent.run({
		command: 'cloud env list --org --no-mask',
	});

	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(Boolean(keyLine), `Key ${testKey} should be in list: ${listOutput}`);
	assert(keyLine!.includes(testValue), 'Full secret value should appear with --no-mask');

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env list masks secrets by default
test('cli-org-env-secrets', 'org-env-list-masks-secrets-by-default', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_MASK_TEST'));
	const testValue = 'super_secret_org_value_12345';

	// Set a secret
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --secret --org`,
	});

	// List without --no-mask
	const listResult = await cliAgent.run({
		command: 'cloud env list --org',
	});

	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');
	const keyLine = lines.find((l) => l.includes(testKey));
	assert(Boolean(keyLine), `Key ${testKey} should be in list: ${listOutput}`);
	assert(!keyLine!.includes(testValue), 'Full secret value should NOT appear (should be masked)');
	assert(keyLine!.includes('[secret]'), 'Should be marked as [secret]');

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env set blocks reserved AGENTUITY_ key
test('cli-org-env-secrets', 'org-env-set-blocks-reserved-agentuity-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set AGENTUITY_SDK_KEY test_value --org',
	});

	assertEqual(result.success, false, 'Should reject reserved AGENTUITY_ key');
	assert(
		result.stderr?.includes('reserved for system use') ||
			result.stdout?.includes('reserved for system use') ||
			false,
		'Should mention reserved for system use'
	);
});

// Test: org env set --secret blocks reserved AGENTUITY_ key
test('cli-org-env-secrets', 'org-env-set-secret-blocks-reserved-agentuity-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set AGENTUITY_SDK_KEY test_value --secret --org',
	});

	assertEqual(result.success, false, 'Should reject reserved AGENTUITY_ key');
	assert(
		result.stderr?.includes('reserved for system use') ||
			result.stdout?.includes('reserved for system use') ||
			false,
		'Should mention reserved for system use'
	);
});

// Test: org env set --secret blocks VITE_ prefix
test('cli-org-env-secrets', 'org-env-set-secret-blocks-vite-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set VITE_API_KEY test_value --secret --org',
	});

	assertEqual(result.success, false, 'Should reject VITE_ as secret');
	assert(
		result.stderr?.includes('public variables as secrets') ||
			result.stdout?.includes('public variables as secrets') ||
			false,
		'Should mention public variables cannot be secrets'
	);
});

// Test: org env set --secret blocks PUBLIC_ prefix
test('cli-org-env-secrets', 'org-env-set-secret-blocks-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set PUBLIC_URL test_value --secret --org',
	});

	assertEqual(result.success, false, 'Should reject PUBLIC_ as secret');
	assert(
		result.stderr?.includes('public variables as secrets') ||
			result.stdout?.includes('public variables as secrets') ||
			false,
		'Should mention public variables cannot be secrets'
	);
});

// Test: org env set --secret blocks AGENTUITY_PUBLIC_ prefix
test('cli-org-env-secrets', 'org-env-set-secret-blocks-agentuity-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set AGENTUITY_PUBLIC_KEY test_value --secret --org',
	});

	assertEqual(result.success, false, 'Should reject AGENTUITY_PUBLIC_ as secret');
	assert(
		result.stderr?.includes('public variables as secrets') ||
			result.stdout?.includes('public variables as secrets') ||
			false,
		'Should mention public variables cannot be secrets'
	);
});

// Test: org env delete blocks reserved AGENTUITY_ key
test('cli-org-env-secrets', 'org-env-delete-blocks-reserved-agentuity-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env delete AGENTUITY_SDK_KEY --org',
	});

	assertEqual(result.success, false, 'Should reject deleting reserved AGENTUITY_ key');
	assert(
		result.stderr?.includes('reserved for system use') ||
			result.stdout?.includes('reserved for system use') ||
			false,
		'Should mention reserved for system use'
	);
});

// Test: org env set allows AGENTUITY_PUBLIC_ prefix
test('cli-org-env-secrets', 'org-env-set-allows-agentuity-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(`AGENTUITY_PUBLIC_${uniqueId('ORG_TEST')}`);
	const testValue = 'org_public_test_value';

	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --org`,
	});

	const setOutput = (setResult.stdout || '') + (setResult.stderr || '');
	assert(
		Boolean(
			setResult.success ||
				setOutput.includes('Setting') ||
				setOutput.includes('set successfully')
		),
		`Should allow AGENTUITY_PUBLIC_ as org env var: ${setOutput}`
	);
	assert(
		!setOutput.includes('reserved for system use'),
		'Should not reject AGENTUITY_PUBLIC_ as reserved'
	);

	// Verify it was set
	const getResult = await cliAgent.run({
		command: `cloud env get ${testKey} --org`,
	});
	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	assert(
		Boolean(getResult.success || getOutput.includes(testValue)),
		`Get should find ${testKey}: ${getOutput}`
	);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env overwrite updates existing value
test('cli-org-env-secrets', 'org-env-set-overwrite', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_OVERWRITE_TEST'));
	const value1 = 'first_org_value';
	const value2 = 'second_org_value';

	// Set initial value
	await cliAgent.run({
		command: `cloud env set ${testKey} ${value1} --org`,
	});

	// Overwrite with new value
	const setResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${value2} --org`,
	});
	assert(Boolean(setResult.success), `Overwrite should succeed: ${setResult.stderr}`);

	// Get and verify new value
	const getResult = await cliAgent.run({
		command: `cloud env get ${testKey} --org`,
	});
	const getOutput = (getResult.stdout || '') + (getResult.stderr || '');
	assert(getOutput.includes(value2), `Should return updated value: ${getOutput}`);
	assert(!getOutput.includes(value1), 'Should not contain old value');

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org secret to env conversion
test('cli-org-env-secrets', 'org-secret-to-env-conversion', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_CONVERT_TEST'));
	const value = 'org_convert_test_value';

	// Set as secret
	const setSecretResult = await cliAgent.run({
		command: `cloud env set ${testKey} ${value} --secret --org`,
	});
	assert(
		Boolean(setSecretResult.success || setSecretResult.stdout?.includes('Secret')),
		`Set as secret should succeed: ${setSecretResult.stderr}`
	);

	// Verify it's a secret
	const listBefore = await cliAgent.run({
		command: 'cloud env list --org',
	});
	const listBeforeOutput = (listBefore.stdout || '') + (listBefore.stderr || '');
	const linesBefore = listBeforeOutput.split('\n');
	const keyLineBefore = linesBefore.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLineBefore && keyLineBefore.includes('[secret]')),
		`Should be listed as secret: ${keyLineBefore || 'key not found'}`
	);

	// Convert to regular env (no --secret flag)
	await cliAgent.run({
		command: `cloud env set ${testKey} ${value} --org`,
	});

	// Verify it's now an env var
	const listAfter = await cliAgent.run({
		command: 'cloud env list --org',
	});
	const listAfterOutput = (listAfter.stdout || '') + (listAfter.stderr || '');
	const linesAfter = listAfterOutput.split('\n');
	const keyLineAfter = linesAfter.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLineAfter && !keyLineAfter.includes('[secret]')),
		`Should now be a regular env var: ${keyLineAfter || 'key not found'}`
	);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env to secret conversion
test('cli-org-env-secrets', 'org-env-to-secret-conversion', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('ORG_TOSECRET_TEST'));
	const value = 'org_to_secret_value';

	// Set as env var
	await cliAgent.run({
		command: `cloud env set ${testKey} ${value} --org`,
	});

	// Verify it's an env var
	const listBefore = await cliAgent.run({
		command: 'cloud env list --org',
	});
	const listBeforeOutput = (listBefore.stdout || '') + (listBefore.stderr || '');
	const linesBefore = listBeforeOutput.split('\n');
	const keyLineBefore = linesBefore.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLineBefore && !keyLineBefore.includes('[secret]')),
		`Should be listed as env var: ${keyLineBefore || 'key not found'}`
	);

	// Convert to secret
	await cliAgent.run({
		command: `cloud env set ${testKey} ${value} --secret --org`,
	});

	// Verify it's now a secret
	const listAfter = await cliAgent.run({
		command: 'cloud env list --org',
	});
	const listAfterOutput = (listAfter.stdout || '') + (listAfter.stderr || '');
	const linesAfter = listAfterOutput.split('\n');
	const keyLineAfter = linesAfter.find((l) => l.includes(testKey));
	assert(
		Boolean(keyLineAfter && keyLineAfter.includes('[secret]')),
		`Should now be a secret: ${keyLineAfter || 'key not found'}`
	);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${testKey} --org`,
	});
});

// Test: org env list --secrets shows only secrets
test('cli-org-env-secrets', 'org-env-list-secrets-filter', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const envKey = trackKey(uniqueId('ORG_FILTER_ENV'));
	const secretKey = trackKey(uniqueId('ORG_FILTER_SECRET'));

	// Set an env var and a secret
	await cliAgent.run({
		command: `cloud env set ${envKey} env_value --org`,
	});
	await cliAgent.run({
		command: `cloud env set ${secretKey} secret_value --secret --org`,
	});

	// List with --secrets filter
	const listResult = await cliAgent.run({
		command: 'cloud env list --org --secrets',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');

	assert(listOutput.includes(secretKey), `Should include secret: ${listOutput}`);
	assert(!listOutput.includes(envKey), `Should not include env var: ${listOutput}`);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${envKey} --org`,
	});
	await cliAgent.run({
		command: `cloud env delete ${secretKey} --org`,
	});
});

// Test: org env list --env-only shows only env vars
test('cli-org-env-secrets', 'org-env-list-env-only-filter', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const envKey = trackKey(uniqueId('ORG_ENVONLY_ENV'));
	const secretKey = trackKey(uniqueId('ORG_ENVONLY_SECRET'));

	// Set an env var and a secret
	await cliAgent.run({
		command: `cloud env set ${envKey} env_value --org`,
	});
	await cliAgent.run({
		command: `cloud env set ${secretKey} secret_value --secret --org`,
	});

	// List with --env-only filter
	const listResult = await cliAgent.run({
		command: 'cloud env list --org --env-only',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');

	assert(listOutput.includes(envKey), `Should include env var: ${listOutput}`);
	assert(!listOutput.includes(secretKey), `Should not include secret: ${listOutput}`);

	// Cleanup
	await cliAgent.run({
		command: `cloud env delete ${envKey} --org`,
	});
	await cliAgent.run({
		command: `cloud env delete ${secretKey} --org`,
	});
});

// Final cleanup test - runs last to clean up any leftover org env vars
test('cli-org-env-secrets', 'zzz-cleanup-all-org-env-vars', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	// Get all org env vars and delete any that match our test patterns
	const listResult = await cliAgent.run({
		command: 'cloud env list --org',
	});
	const listOutput = (listResult.stdout || '') + (listResult.stderr || '');
	const lines = listOutput.split('\n');

	// Patterns that indicate test-created org env vars
	const testPatterns = [
		/^ORG_ENV_TEST_/,
		/^ORG_SECRET_TEST_/,
		/^ORG_GET_TEST_/,
		/^ORG_LIST_TEST_/,
		/^ORG_DELETE_TEST_/,
		/^ORG_NOMASK_TEST_/,
		/^ORG_MASK_TEST_/,
		/^AGENTUITY_PUBLIC_ORG_TEST_/,
		/^ORG_OVERWRITE_TEST_/,
		/^ORG_CONVERT_TEST_/,
		/^ORG_TOSECRET_TEST_/,
		/^ORG_FILTER_/,
		/^ORG_ENVONLY_/,
	];

	const keysToDelete: string[] = [];
	for (const line of lines) {
		// Extract key name from line
		const match = line.match(/^([A-Z][A-Z0-9_]*)/);
		if (match) {
			const key = match[1];
			if (testPatterns.some((pattern) => pattern.test(key))) {
				keysToDelete.push(key);
			}
		}
	}

	// Also add any tracked keys that might have been missed
	for (const key of createdOrgEnvVars) {
		if (!keysToDelete.includes(key)) {
			keysToDelete.push(key);
		}
	}

	// Delete all test org env vars
	for (const key of keysToDelete) {
		await cliAgent.run({
			command: `cloud env delete ${key} --org`,
		});
	}

	// Clear the tracking array
	createdOrgEnvVars.length = 0;
});
