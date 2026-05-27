import { describe, expect, test } from 'bun:test';
import { buildDeployArgs } from '../../../src/cmd/build/ci';

describe('build ci', () => {
	test('passes skip DNS validation to nested deploy', () => {
		const args = buildDeployArgs({ skipDnsValidation: true });
		expect(args).toContain('--skip-dns-validation');
	});

	test('passes managed trigger to nested deploy', () => {
		const args = buildDeployArgs({ trigger: 'managed' });
		expect(args).toEqual(['--trigger', 'managed']);
	});
});
