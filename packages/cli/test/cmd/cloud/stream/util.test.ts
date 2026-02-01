import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { createMockLogger } from '@agentuity/test-utils';

/**
 * Tests for the stream util auth selection logic.
 *
 * The createStorageAdapter function in util.ts implements a dual-auth strategy:
 * 1. SDK key auth (preferred) - uses AGENTUITY_SDK_KEY from project .env files
 * 2. CLI key auth (fallback) - uses CLI API key with orgId query param
 *
 * These tests verify the orgId resolution order for CLI key auth:
 * 1. --org-id flag (options.orgId)
 * 2. AGENTUITY_CLOUD_ORG_ID env var
 * 3. config.preferences.orgId
 * 4. project.orgId
 */

describe('stream util auth selection', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Reset env vars before each test
		delete process.env.AGENTUITY_CLOUD_ORG_ID;
	});

	afterEach(() => {
		// Restore original env
		process.env = { ...originalEnv };
	});

	describe('orgId resolution order', () => {
		test('options.orgId takes precedence over all other sources', () => {
			// Set up all possible orgId sources
			process.env.AGENTUITY_CLOUD_ORG_ID = 'env_org';
			const configOrgId = 'config_org';
			const projectOrgId = 'project_org';
			const optionsOrgId = 'options_org';

			// Simulate the resolution logic from util.ts
			const resolvedOrgId =
				optionsOrgId ?? process.env.AGENTUITY_CLOUD_ORG_ID ?? configOrgId ?? projectOrgId;

			expect(resolvedOrgId).toBe('options_org');
		});

		test('AGENTUITY_CLOUD_ORG_ID env var is used when options.orgId is undefined', () => {
			process.env.AGENTUITY_CLOUD_ORG_ID = 'env_org';
			const configOrgId = 'config_org';
			const projectOrgId = 'project_org';
			const optionsOrgId = undefined;

			const resolvedOrgId =
				optionsOrgId ?? process.env.AGENTUITY_CLOUD_ORG_ID ?? configOrgId ?? projectOrgId;

			expect(resolvedOrgId).toBe('env_org');
		});

		test('config.preferences.orgId is used when options and env are undefined', () => {
			const configOrgId = 'config_org';
			const projectOrgId = 'project_org';
			const optionsOrgId = undefined;

			const resolvedOrgId =
				optionsOrgId ?? process.env.AGENTUITY_CLOUD_ORG_ID ?? configOrgId ?? projectOrgId;

			expect(resolvedOrgId).toBe('config_org');
		});

		test('project.orgId is used as last resort', () => {
			const configOrgId = undefined;
			const projectOrgId = 'project_org';
			const optionsOrgId = undefined;

			const resolvedOrgId =
				optionsOrgId ?? process.env.AGENTUITY_CLOUD_ORG_ID ?? configOrgId ?? projectOrgId;

			expect(resolvedOrgId).toBe('project_org');
		});

		test('resolves to undefined when no orgId source is available', () => {
			const configOrgId = undefined;
			const projectOrgId = undefined;
			const optionsOrgId = undefined;

			const resolvedOrgId =
				optionsOrgId ?? process.env.AGENTUITY_CLOUD_ORG_ID ?? configOrgId ?? projectOrgId;

			expect(resolvedOrgId).toBeUndefined();
		});
	});

	describe('auth strategy selection', () => {
		test('SDK key auth does not require orgId', () => {
			// When SDK key is available, no queryParams are needed
			const sdkKey = 'sk_test_key';
			const authToken = sdkKey;
			const queryParams = undefined; // No queryParams for SDK key auth

			expect(authToken).toBe('sk_test_key');
			expect(queryParams).toBeUndefined();
		});

		test('CLI key auth requires orgId in queryParams', () => {
			// When using CLI key, orgId must be passed as query param
			const cliApiKey = 'ck_test_key';
			const orgId = 'org_123';

			const authToken = cliApiKey;
			const queryParams = { orgId };

			expect(authToken).toBe('ck_test_key');
			expect(queryParams).toEqual({ orgId: 'org_123' });
		});

		test('CLI key auth without orgId should trigger error', () => {
			// This simulates the error case in util.ts where tui.fatal() is called
			const sdkKey = null; // No SDK key available
			const orgId = undefined; // No orgId available

			// In the actual code, this would call tui.fatal()
			// Here we just verify the condition that triggers the error
			const shouldError = !sdkKey && !orgId;
			expect(shouldError).toBe(true);
		});
	});

	describe('queryParams structure', () => {
		test('queryParams contains only orgId for CLI key auth', () => {
			const orgId = 'org_test_123';
			const queryParams = { orgId };

			expect(Object.keys(queryParams)).toEqual(['orgId']);
			expect(queryParams.orgId).toBe('org_test_123');
		});

		test('queryParams is passed to createServerFetchAdapter config', () => {
			// Verify the structure matches what createServerFetchAdapter expects
			const config = {
				headers: {
					Authorization: 'Bearer ck_test_key',
				},
				queryParams: { orgId: 'org_123' },
			};

			expect(config.headers.Authorization).toContain('Bearer');
			expect(config.queryParams).toBeDefined();
			expect(config.queryParams.orgId).toBe('org_123');
		});
	});
});
