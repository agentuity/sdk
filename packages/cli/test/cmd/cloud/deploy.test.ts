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
	});
});
