import { describe, expect, test } from 'bun:test';
import { deploySubcommand } from '../../../src/cmd/cloud/deploy';

describe('cloud deploy', () => {
	describe('deploySubcommand definition', () => {
		test('accepts a project name for auto-registration', () => {
			const options = deploySubcommand.schema?.options;
			expect(options).toBeDefined();
			if (!options) {
				throw new Error('deploy options schema is missing');
			}

			const result = options.safeParse({
				name: 'My Display Project',
			});

			expect(result.success).toBe(true);
		});

		test('accepts skip DNS validation flag', () => {
			const options = deploySubcommand.schema?.options;
			expect(options).toBeDefined();
			if (!options) {
				throw new Error('deploy options schema is missing');
			}

			const result = options.safeParse({
				skipDnsValidation: true,
			});

			expect(result.success).toBe(true);
		});

		test('accepts offline upload-url and pack-only flags', () => {
			const options = deploySubcommand.schema?.options;
			expect(options).toBeDefined();
			if (!options) {
				throw new Error('deploy options schema is missing');
			}

			const result = options.safeParse({
				uploadUrl: 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc',
				packOnly: true,
				packOutput: './out/deploy.zip',
				projectId: 'proj_123',
				orgId: 'org_456',
				region: 'us-west-2',
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.uploadUrl).toContain('s3.amazonaws.com');
				expect(result.data.packOnly).toBe(true);
				expect(result.data.packOutput).toBe('./out/deploy.zip');
				expect(result.data.projectId).toBe('proj_123');
				expect(result.data.orgId).toBe('org_456');
				expect(result.data.region).toBe('us-west-2');
			}
		});

		test('rejects invalid upload-url', () => {
			const options = deploySubcommand.schema?.options;
			expect(options).toBeDefined();
			if (!options) {
				throw new Error('deploy options schema is missing');
			}

			const result = options.safeParse({
				uploadUrl: 'not-a-url',
			});

			expect(result.success).toBe(false);
		});
	});
});
