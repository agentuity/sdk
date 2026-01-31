import { describe, expect, test } from 'bun:test';
import { orgSubcommand } from '../../../src/cmd/auth/org';

describe('auth org commands', () => {
	describe('orgSubcommand definition', () => {
		test('should have correct name', () => {
			expect(orgSubcommand.name).toBe('org');
		});

		test('should have description', () => {
			expect(orgSubcommand.description).toBe(
				'Manage organization preferences and machine authentication'
			);
		});

		test('should have subcommands', () => {
			expect(orgSubcommand.subcommands).toBeDefined();
			expect(orgSubcommand.subcommands?.length).toBe(6);
		});

		test('should have examples', () => {
			expect(orgSubcommand.examples).toBeDefined();
			expect(orgSubcommand.examples?.length).toBeGreaterThan(0);
		});
	});

	describe('select subcommand', () => {
		const selectCommand = orgSubcommand.subcommands?.find((c) => c.name === 'select');

		test('should exist', () => {
			expect(selectCommand).toBeDefined();
		});

		test('should require auth', () => {
			expect(selectCommand?.requires?.auth).toBe(true);
		});

		test('should require apiClient', () => {
			expect(selectCommand?.requires?.apiClient).toBe(true);
		});

		test('should have response schema', () => {
			expect(selectCommand?.schema?.response).toBeDefined();
		});

		test('should have args schema for org_id', () => {
			expect(selectCommand?.schema?.args).toBeDefined();
		});
	});

	describe('unselect subcommand', () => {
		const unselectCommand = orgSubcommand.subcommands?.find((c) => c.name === 'unselect');

		test('should exist', () => {
			expect(unselectCommand).toBeDefined();
		});

		test('should require auth', () => {
			expect(unselectCommand?.requires?.auth).toBe(true);
		});

		test('should have response schema', () => {
			expect(unselectCommand?.schema?.response).toBeDefined();
		});
	});

	describe('current subcommand', () => {
		const currentCommand = orgSubcommand.subcommands?.find((c) => c.name === 'current');

		test('should exist', () => {
			expect(currentCommand).toBeDefined();
		});

		test('should require auth', () => {
			expect(currentCommand?.requires?.auth).toBe(true);
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

	describe('enroll subcommand', () => {
		const enrollCommand = orgSubcommand.subcommands?.find((c) => c.name === 'enroll');

		test('should exist', () => {
			expect(enrollCommand).toBeDefined();
		});

		test('should require auth', () => {
			expect(enrollCommand?.requires?.auth).toBe(true);
		});
	});

	describe('unenroll subcommand', () => {
		const unenrollCommand = orgSubcommand.subcommands?.find((c) => c.name === 'unenroll');

		test('should exist', () => {
			expect(unenrollCommand).toBeDefined();
		});

		test('should require auth', () => {
			expect(unenrollCommand?.requires?.auth).toBe(true);
		});
	});

	describe('status subcommand', () => {
		const statusCommand = orgSubcommand.subcommands?.find((c) => c.name === 'status');

		test('should exist', () => {
			expect(statusCommand).toBeDefined();
		});

		test('should require auth', () => {
			expect(statusCommand?.requires?.auth).toBe(true);
		});
	});
});
