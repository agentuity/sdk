import { describe, test, expect } from 'bun:test';
import { validateBucketName, validateDatabaseName } from '@agentuity/server';
import { suggestBucketName, suggestDatabaseName } from '../../../src/cmd/project/random-name';

describe('suggestBucketName', () => {
	test('produces a valid name from a simple project name', () => {
		const name = suggestBucketName('my-bot');
		expect(validateBucketName(name).valid).toBe(true);
		expect(name).toMatch(/^my-bot-storage-[a-z0-9]{3}$/);
	});

	test('lowercases and replaces spaces in project name', () => {
		const name = suggestBucketName('My Cool Bot');
		expect(validateBucketName(name).valid).toBe(true);
		expect(name.startsWith('my-cool-bot-storage-')).toBe(true);
	});

	test('strips reserved prefix `agentuity`', () => {
		const name = suggestBucketName('agentuity-helper');
		expect(validateBucketName(name).valid).toBe(true);
		expect(name.startsWith('agentuity')).toBe(false);
	});

	test('strips reserved prefix `ag-`', () => {
		const name = suggestBucketName('ag-foo');
		expect(validateBucketName(name).valid).toBe(true);
		expect(name.startsWith('ag-')).toBe(false);
	});

	test('falls back to generic name when project name has no usable chars', () => {
		const name = suggestBucketName('!!!');
		expect(validateBucketName(name).valid).toBe(true);
		expect(name.startsWith('bucket')).toBe(true);
	});

	test('handles empty project name', () => {
		const name = suggestBucketName('');
		expect(validateBucketName(name).valid).toBe(true);
	});

	test('truncates long project names while keeping a valid suffix', () => {
		const longName = 'a'.repeat(200);
		const name = suggestBucketName(longName);
		expect(validateBucketName(name).valid).toBe(true);
		expect(name.length).toBeLessThanOrEqual(63);
		expect(name).toMatch(/-storage-[a-z0-9]{3}$/);
	});

	test('strips trailing hyphens after truncation', () => {
		// Construct a name that, when truncated, would otherwise end on a hyphen.
		const tricky = `${'a'.repeat(50)}-${'b'.repeat(50)}`;
		const name = suggestBucketName(tricky);
		expect(validateBucketName(name).valid).toBe(true);
	});
});

describe('suggestDatabaseName', () => {
	test('produces a valid name from a simple project name', () => {
		const name = suggestDatabaseName('mybot');
		expect(validateDatabaseName(name).valid).toBe(true);
		expect(name).toMatch(/^mybot_db_[a-z0-9]{3}$/);
	});

	test('lowercases and replaces hyphens/spaces with underscores', () => {
		const name = suggestDatabaseName('My-Cool Bot');
		expect(validateDatabaseName(name).valid).toBe(true);
		expect(name.startsWith('my_cool_bot_db_')).toBe(true);
	});

	test('prepends `p_` when project name starts with a digit', () => {
		const name = suggestDatabaseName('123bot');
		expect(validateDatabaseName(name).valid).toBe(true);
		expect(name.startsWith('p_')).toBe(true);
	});

	test('strips reserved `pg_` prefix', () => {
		const name = suggestDatabaseName('pg_admin');
		expect(validateDatabaseName(name).valid).toBe(true);
		expect(name.startsWith('pg_')).toBe(false);
	});

	test('falls back to generic name when project name has no usable chars', () => {
		const name = suggestDatabaseName('!!!');
		expect(validateDatabaseName(name).valid).toBe(true);
		expect(name.startsWith('db_')).toBe(true);
	});

	test('handles empty project name', () => {
		const name = suggestDatabaseName('');
		expect(validateDatabaseName(name).valid).toBe(true);
	});

	test('truncates long project names while keeping a valid suffix', () => {
		const longName = 'a'.repeat(200);
		const name = suggestDatabaseName(longName);
		expect(validateDatabaseName(name).valid).toBe(true);
		expect(name.length).toBeLessThanOrEqual(63);
		expect(name).toMatch(/_db_[a-z0-9]{3}$/);
	});

	test('produces different suffixes across calls', () => {
		const names = new Set<string>();
		for (let i = 0; i < 20; i++) {
			names.add(suggestDatabaseName('mybot'));
		}
		// 20 calls × 36^3 (~46k) suffix space — collisions are vanishingly unlikely.
		expect(names.size).toBeGreaterThan(1);
	});
});
