import { describe, test, expect } from 'bun:test';
import { deleteSubcommand, parseDuration } from '../../../../src/cmd/cloud/task/delete';

describe('task delete command', () => {
	describe('command metadata', () => {
		test('has correct name', () => {
			expect(deleteSubcommand.name).toBe('delete');
		});

		test('has aliases', () => {
			expect(deleteSubcommand.aliases).toContain('del');
			expect(deleteSubcommand.aliases).toContain('rm');
		});

		test('has destructive tags', () => {
			expect(deleteSubcommand.tags).toContain('destructive');
			expect(deleteSubcommand.tags).toContain('deletes-resource');
			expect(deleteSubcommand.tags).toContain('requires-auth');
		});

		test('requires auth', () => {
			const requires = deleteSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.auth).toBe(true);
		});

		test('does not require region', () => {
			const requires = deleteSubcommand.requires as Record<string, boolean> | undefined;
			expect(requires?.region).toBeUndefined();
		});

		test('has examples', () => {
			expect(deleteSubcommand.examples).toBeDefined();
			expect(deleteSubcommand.examples!.length).toBeGreaterThan(0);
		});
	});

	describe('parseDuration', () => {
		test('parses minutes', () => {
			expect(parseDuration('30m')).toBe(30 * 60 * 1000);
		});

		test('parses hours', () => {
			expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
		});

		test('parses days', () => {
			expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
		});

		test('parses weeks', () => {
			expect(parseDuration('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
		});

		test('parses single unit values', () => {
			expect(parseDuration('1m')).toBe(60 * 1000);
			expect(parseDuration('1h')).toBe(60 * 60 * 1000);
			expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
			expect(parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
		});

		test('parses large values', () => {
			expect(parseDuration('365d')).toBe(365 * 24 * 60 * 60 * 1000);
			expect(parseDuration('100h')).toBe(100 * 60 * 60 * 1000);
		});
	});
});
