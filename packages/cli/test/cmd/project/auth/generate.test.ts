import { describe, test, expect } from 'bun:test';
import { generateSubcommand } from '../../../../src/cmd/project/auth/generate';

describe('project auth generate', () => {
	describe('generateSubcommand definition', () => {
		test('should have correct name', () => {
			expect(generateSubcommand.name).toBe('generate');
		});

		test('should have description', () => {
			expect(generateSubcommand.description).toBe(
				'Generate SQL schema for Agentuity Auth tables'
			);
		});

		test('should have slow tag', () => {
			expect(generateSubcommand.tags).toContain('slow');
		});

		test('should have output option in schema', () => {
			expect(generateSubcommand.schema?.options?.shape?.output).toBeDefined();
		});

		test('should have stdout option in schema', () => {
			expect(generateSubcommand.schema?.options?.shape?.stdout).toBeDefined();
		});

		test('should have response schema with success', () => {
			expect(generateSubcommand.schema?.response).toBeDefined();
		});

		test('should have examples', () => {
			expect(generateSubcommand.examples).toBeDefined();
			expect(generateSubcommand.examples?.length).toBeGreaterThan(0);
		});

		test('should not require auth', () => {
			expect(generateSubcommand.requires?.auth).toBeUndefined();
		});

		test('should not require org', () => {
			expect(generateSubcommand.requires?.org).toBeUndefined();
		});
	});
});
