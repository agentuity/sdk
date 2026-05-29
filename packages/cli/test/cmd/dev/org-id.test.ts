import { describe, expect, test } from 'bun:test';
import { resolveDevOrgId } from '../../../src/cmd/dev/index.ts';

describe('resolveDevOrgId', () => {
	test('prefers project org ID over env and config values', () => {
		expect(
			resolveDevOrgId({
				env: {
					AGENTUITY_CLOUD_ORG_ID: 'org_cloud',
					AGENTUITY_ORGID: 'org_env',
				},
				projectConfig: { orgId: 'org_project' },
				config: { preferences: { orgId: 'org_config' } },
			})
		).toBe('org_project');
	});

	test('falls back to AGENTUITY_CLOUD_ORG_ID for unlinked projects', () => {
		expect(
			resolveDevOrgId({
				env: { AGENTUITY_CLOUD_ORG_ID: 'org_cloud' },
				projectConfig: null,
				config: null,
			})
		).toBe('org_cloud');
	});

	test('falls back to CLI profile org for unlinked projects', () => {
		expect(
			resolveDevOrgId({
				env: {},
				projectConfig: null,
				config: { preferences: { orgId: 'org_config' } },
			})
		).toBe('org_config');
	});

	test('ignores blank org IDs', () => {
		expect(
			resolveDevOrgId({
				env: {
					AGENTUITY_CLOUD_ORG_ID: '  ',
					AGENTUITY_ORGID: '',
					AGENTUITY_ORG_ID: 'org_alt',
				},
				projectConfig: { orgId: ' ' },
				config: { preferences: { orgId: 'org_config' } },
			})
		).toBe('org_alt');
	});
});
