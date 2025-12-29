/**
 * AI SDK Gateway Tests
 *
 * Tests for AI Gateway API key injection (issue #348)
 *
 * These tests verify that:
 * 1. AGENTUITY_SDK_KEY and AGENTUITY_TRANSPORT_URL are loaded from .env
 * 2. The AI SDK patches correctly inject the API key
 * 3. createOpenAI() works without explicit apiKey when gateway is configured
 */

import { test } from './suite';
import { assert, assertEqual, assertTruthy } from './helpers';
import aiSdkGatewayCheckAgent from '@agents/ai-sdk/gateway-check';

// Test: Environment variables are loaded for AI Gateway
test('ai-sdk-gateway', 'env-vars-loaded', async () => {
	const result = await aiSdkGatewayCheckAgent.run({ operation: 'check-env' });

	assertEqual(result.operation, 'check-env');

	// In a properly configured environment, both should be true
	// If running without cloud config, this test documents the expected behavior
	if (result.hasSDKKey && result.hasTransportUrl) {
		assertTruthy(result.success, 'Should succeed when env vars are present');
		assert(
			result.message.includes('configured'),
			'Message should indicate configuration is correct'
		);
	} else {
		// Document which vars are missing (helpful for debugging)
		console.log(`[ai-sdk-gateway] SDK Key present: ${result.hasSDKKey}`);
		console.log(`[ai-sdk-gateway] Transport URL present: ${result.hasTransportUrl}`);
	}
});

// Test: createOpenAI() works without explicit apiKey (issue #348 regression test)
test('ai-sdk-gateway', 'create-provider-no-apikey', async () => {
	const result = await aiSdkGatewayCheckAgent.run({ operation: 'create-provider' });

	assertEqual(result.operation, 'create-provider');

	// This is the core test for issue #348
	// Before the fix: createOpenAI({}) would throw "API key is missing"
	// After the fix: Gateway injects AGENTUITY_SDK_KEY as the apiKey
	if (result.hasSDKKey && result.hasTransportUrl) {
		assertTruthy(
			result.success,
			`createOpenAI should succeed with gateway injection: ${result.error || result.message}`
		);
		assert(
			!result.error,
			`Should not have error when gateway is configured: ${result.error}`
		);
	} else {
		// Without gateway config, we expect it to fail with API key error
		// This is expected behavior when not connected to cloud
		console.log(`[ai-sdk-gateway] Skipping assertion - no gateway config`);
		console.log(`[ai-sdk-gateway] Result: ${result.message}`);
	}
});

// Test: Model instance can be created
test('ai-sdk-gateway', 'create-model-instance', async () => {
	const result = await aiSdkGatewayCheckAgent.run({ operation: 'create-model' });

	assertEqual(result.operation, 'create-model');

	if (result.hasSDKKey && result.hasTransportUrl) {
		assertTruthy(
			result.success,
			`Model creation should succeed: ${result.error || result.message}`
		);
	} else {
		console.log(`[ai-sdk-gateway] Skipping model test - no gateway config`);
	}
});

// Test: Verify gateway environment check reports correct state
test('ai-sdk-gateway', 'env-check-consistency', async () => {
	const result = await aiSdkGatewayCheckAgent.run({ operation: 'check-env' });

	// Verify the result structure is correct
	assertEqual(typeof result.success, 'boolean', 'success should be boolean');
	assertEqual(typeof result.hasSDKKey, 'boolean', 'hasSDKKey should be boolean');
	assertEqual(typeof result.hasTransportUrl, 'boolean', 'hasTransportUrl should be boolean');
	assertEqual(typeof result.message, 'string', 'message should be string');

	// Success should only be true if both env vars are present
	if (result.success) {
		assertTruthy(result.hasSDKKey, 'hasSDKKey should be true when success is true');
		assertTruthy(result.hasTransportUrl, 'hasTransportUrl should be true when success is true');
	}
});
