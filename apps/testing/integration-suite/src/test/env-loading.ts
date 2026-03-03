/**
 * Environment Loading Tests
 *
 * Tests that verify environment variables (especially AGENTUITY_SDK_KEY)
 * are correctly loaded from profile-specific .env files during dev mode.
 *
 * This reproduces the bug from https://github.com/agentuity/sdk/issues/222
 * where AGENTUITY_SDK_KEY wasn't being loaded from .env.local
 */

import { test } from '@test/suite';
import { assert, assertDefined, assertEqual } from '@test/helpers';
import sdkKeyCheckAgent from '@agents/env/sdk-key-check';

// Test: SDK key is loaded from .env.local
test('env-loading', 'sdk-key-available', async () => {
	const result = await sdkKeyCheckAgent.run();

	// The AGENTUITY_SDK_KEY should be loaded from .env.local
	assert(result.hasSdkKey, 'AGENTUITY_SDK_KEY should be set in process.env');
	assertDefined(result.sdkKeyPrefix, 'SDK key prefix should be available');

	// Verify it's not empty
	assert(result.sdkKeyPrefix.length > 0, 'SDK key should not be empty');
});

// Test: Multiple AGENTUITY_* env vars are loaded
test('env-loading', 'agentuity-env-vars', async () => {
	const result = await sdkKeyCheckAgent.run();

	// Should have at least AGENTUITY_SDK_KEY and AGENTUITY_REGION
	assert(result.allEnvKeys.length >= 2, 'Should have multiple AGENTUITY_* env vars');
	assert(
		result.allEnvKeys.includes('AGENTUITY_SDK_KEY'),
		'AGENTUITY_SDK_KEY should be in env vars'
	);
});

// Test: Verify SDK key is accessible for patching
test('env-loading', 'sdk-key-for-patching', async () => {
	const result = await sdkKeyCheckAgent.run();

	// This is the critical check - the patching mechanism in
	// sdk/packages/cli/src/cmd/build/patch/_util.ts checks process.env.AGENTUITY_SDK_KEY
	assertEqual(result.hasSdkKey, true, 'SDK key must be available for AI SDK patching to work');
});
