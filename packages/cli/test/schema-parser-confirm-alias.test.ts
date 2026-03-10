import { describe, test, expect } from 'bun:test';
import { buildValidationInput, buildValidationInputAsync } from '../src/schema-parser';
import { z } from 'zod';

describe('confirm flag aliasing', () => {
	const schemaWithConfirm = {
		options: z.object({
			confirm: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
	};

	const schemaWithoutConfirm = {
		options: z.object({
			verbose: z.boolean().optional().default(false).describe('Enable verbose output'),
		}),
	};

	describe('buildValidationInput', () => {
		test('--yes flag should set confirm to true', () => {
			const input = buildValidationInput(schemaWithConfirm, [], { yes: true });
			expect(input.options.confirm).toBe(true);
		});

		test('--force flag should set confirm to true', () => {
			const input = buildValidationInput(schemaWithConfirm, [], { force: true });
			expect(input.options.confirm).toBe(true);
		});

		test('--confirm flag should still work', () => {
			const input = buildValidationInput(schemaWithConfirm, [], { confirm: true });
			expect(input.options.confirm).toBe(true);
		});

		test('neither flag set should leave confirm undefined', () => {
			const input = buildValidationInput(schemaWithConfirm, [], {});
			expect(input.options.confirm).toBeUndefined();
		});

		test('--confirm takes precedence over --yes', () => {
			const input = buildValidationInput(schemaWithConfirm, [], { confirm: true, yes: false });
			expect(input.options.confirm).toBe(true);
		});

		test('--confirm takes precedence over --force', () => {
			const input = buildValidationInput(schemaWithConfirm, [], {
				confirm: true,
				force: false,
			});
			expect(input.options.confirm).toBe(true);
		});

		test('--yes should not affect schemas without confirm option', () => {
			const input = buildValidationInput(schemaWithoutConfirm, [], { yes: true });
			expect(input.options.yes).toBeUndefined();
			expect(input.options.confirm).toBeUndefined();
		});

		test('--force should not affect schemas without confirm option', () => {
			const input = buildValidationInput(schemaWithoutConfirm, [], { force: true });
			expect(input.options.force).toBeUndefined();
			expect(input.options.confirm).toBeUndefined();
		});

		test('-y flag should work through Commander.js mapping (simulated via confirm)', () => {
			// Note: Commander.js will map -y to confirm, so by the time it reaches
			// buildValidationInput, it should already be set as confirm
			const input = buildValidationInput(schemaWithConfirm, [], { confirm: true });
			expect(input.options.confirm).toBe(true);
		});
	});

	describe('buildValidationInputAsync', () => {
		test('--yes flag should set confirm to true asynchronously', async () => {
			const input = await buildValidationInputAsync(schemaWithConfirm, [], { yes: true });
			expect(input.options.confirm).toBe(true);
		});

		test('--force flag should set confirm to true asynchronously', async () => {
			const input = await buildValidationInputAsync(schemaWithConfirm, [], { force: true });
			expect(input.options.confirm).toBe(true);
		});

		test('usesStdin option should be respected', async () => {
			// When usesStdin is true, stdin confirmation should not be checked
			// (This just verifies the parameter is accepted)
			const input = await buildValidationInputAsync(
				schemaWithConfirm,
				[],
				{ yes: true },
				{ usesStdin: true }
			);
			expect(input.options.confirm).toBe(true);
		});
	});
});
