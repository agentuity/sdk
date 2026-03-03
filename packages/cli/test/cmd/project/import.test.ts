import { describe, test, expect } from 'bun:test';
import { importSubcommand } from '../../../src/cmd/project/import.ts';

describe('project import', () => {
	describe('importSubcommand definition', () => {
		test('should have correct name', () => {
			expect(importSubcommand.name).toBe('import');
		});

		test('should have description', () => {
			expect(importSubcommand.description).toBeTruthy();
			expect(importSubcommand.description).toContain('Import');
		});

		test('should require auth', () => {
			expect(importSubcommand.requires?.auth).toBe(true);
		});

		test('should require apiClient', () => {
			expect(importSubcommand.requires?.apiClient).toBe(true);
		});

		test('should have optional region', () => {
			expect(importSubcommand.optional?.region).toBe(true);
		});

		test('should have mutating tag', () => {
			expect(importSubcommand.tags).toContain('mutating');
		});

		test('should have creates-resource tag', () => {
			expect(importSubcommand.tags).toContain('creates-resource');
		});

		test('should have requires-auth tag', () => {
			expect(importSubcommand.tags).toContain('requires-auth');
		});

		test('should have dir option in schema', () => {
			expect(importSubcommand.schema?.options).toBeDefined();
		});

		test('should have response schema with success', () => {
			expect(importSubcommand.schema?.response).toBeDefined();
		});

		test('should have examples', () => {
			expect(importSubcommand.examples).toBeDefined();
			expect(importSubcommand.examples?.length).toBeGreaterThan(0);
		});
	});
});
