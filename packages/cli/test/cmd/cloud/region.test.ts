import { describe, expect, test } from 'bun:test';
import { regionSubcommand } from '../../../src/cmd/cloud/region/index.ts';

describe('cloud region commands', () => {
	describe('regionSubcommand definition', () => {
		test('should have correct name', () => {
			expect(regionSubcommand.name).toBe('region');
		});

		test('should have description', () => {
			expect(regionSubcommand.description).toBe('Manage default cloud region preference');
		});

		test('should have subcommands', () => {
			expect(regionSubcommand.subcommands).toBeDefined();
			expect(regionSubcommand.subcommands?.length).toBe(3);
		});

		test('should have examples', () => {
			expect(regionSubcommand.examples).toBeDefined();
			expect(regionSubcommand.examples?.length).toBeGreaterThan(0);
		});
	});

	describe('select subcommand', () => {
		const selectCommand = regionSubcommand.subcommands?.find((c) => c.name === 'select');

		test('should exist', () => {
			expect(selectCommand).toBeDefined();
		});

		test('should require auth', () => {
			expect(selectCommand?.requires?.auth).toBe(true);
		});

		test('should require regions', () => {
			expect(selectCommand?.requires?.regions).toBe(true);
		});

		test('should have response schema', () => {
			expect(selectCommand?.schema?.response).toBeDefined();
		});

		test('should have args schema for region', () => {
			expect(selectCommand?.schema?.args).toBeDefined();
		});
	});

	describe('unselect subcommand', () => {
		const unselectCommand = regionSubcommand.subcommands?.find((c) => c.name === 'unselect');

		test('should exist', () => {
			expect(unselectCommand).toBeDefined();
		});

		test('should not require auth', () => {
			expect(unselectCommand?.requires?.auth).toBeUndefined();
		});

		test('should have response schema', () => {
			expect(unselectCommand?.schema?.response).toBeDefined();
		});
	});

	describe('current subcommand', () => {
		const currentCommand = regionSubcommand.subcommands?.find((c) => c.name === 'current');

		test('should exist', () => {
			expect(currentCommand).toBeDefined();
		});

		test('should not require auth', () => {
			expect(currentCommand?.requires?.auth).toBeUndefined();
		});

		test('should be idempotent', () => {
			expect(currentCommand?.idempotent).toBe(true);
		});

		test('should have read-only tag', () => {
			expect(currentCommand?.tags).toContain('read-only');
		});

		test('should have response schema', () => {
			expect(currentCommand?.schema?.response).toBeDefined();
		});
	});
});
