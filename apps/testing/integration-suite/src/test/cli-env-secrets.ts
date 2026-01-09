/**
 * CLI Environment & Secrets Validation Tests
 *
 * Tests the validation rules for env/secret commands:
 * - Reserved AGENTUITY_* keys (except AGENTUITY_PUBLIC_*) are blocked
 * - Public var prefixes (VITE_, AGENTUITY_PUBLIC_, PUBLIC_) cannot be secrets
 * - AGENTUITY_PUBLIC_* keys ARE allowed as env vars
 */

import { test } from '@test/suite';
import { assert, assertEqual } from '@test/helpers';
import cliAgent from '@agents/cli/agent';
import { isAuthenticated } from '@test/helpers/cli';

// Test: Reserved AGENTUITY_ key blocked for secret set
test('cli-env-secrets', 'secret-set-blocks-reserved-agentuity-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud secret set AGENTUITY_SDK_KEY test_value',
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
test('cli-env-secrets', 'secret-set-blocks-vite-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud secret set VITE_API_KEY test_value',
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
test('cli-env-secrets', 'secret-set-blocks-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud secret set PUBLIC_URL test_value',
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
test('cli-env-secrets', 'secret-set-blocks-agentuity-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud secret set AGENTUITY_PUBLIC_KEY test_value',
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

// Test: AGENTUITY_PUBLIC_ allowed for env set
test('cli-env-secrets', 'env-set-allows-agentuity-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set AGENTUITY_PUBLIC_TEST_VAR test_value',
	});

	// Should succeed (cloud set works, local file write may fail if no project dir)
	// Check that it at least got past validation to "Setting environment variable"
	assert(
		result.success ||
			result.stdout?.includes('Setting environment variable') ||
			result.stdout?.includes('set successfully') ||
			false,
		'Should allow AGENTUITY_PUBLIC_ as env var'
	);
	// Should NOT contain the reserved error
	assert(
		!result.stderr?.includes('reserved for system use') &&
			!result.stdout?.includes('reserved for system use'),
		'Should not reject AGENTUITY_PUBLIC_ as reserved'
	);
});

// Test: VITE_ allowed for env set
test('cli-env-secrets', 'env-set-allows-vite-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set VITE_TEST_VAR test_value',
	});

	// Should get past validation
	assert(
		result.success ||
			result.stdout?.includes('Setting environment variable') ||
			result.stdout?.includes('set successfully') ||
			false,
		'Should allow VITE_ as env var'
	);
});

// Test: PUBLIC_ allowed for env set
test('cli-env-secrets', 'env-set-allows-public-prefix', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud env set PUBLIC_TEST_VAR test_value',
	});

	// Should get past validation
	assert(
		result.success ||
			result.stdout?.includes('Setting environment variable') ||
			result.stdout?.includes('set successfully') ||
			false,
		'Should allow PUBLIC_ as env var'
	);
});

// Test: Valid secret key should work (at least get past validation)
test('cli-env-secrets', 'secret-set-allows-valid-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const result = await cliAgent.run({
		command: 'cloud secret set MY_TEST_SECRET_KEY test_value',
	});

	// Should get past validation to cloud operation
	assert(
		result.success ||
			result.stdout?.includes('Setting secret') ||
			result.stdout?.includes('set successfully') ||
			false,
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
});
