import { describe, test, expect } from 'bun:test';
import { parseDuration, resolveMeId, parseMetadataFlag } from '../../../../src/cmd/cloud/task/util';

describe('task util', () => {
	describe('parseDuration', () => {
		describe('valid inputs', () => {
			test('parses seconds', () => {
				expect(parseDuration('30s')).toBe(30 * 1000);
			});

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
				expect(parseDuration('1s')).toBe(1000);
				expect(parseDuration('1m')).toBe(60 * 1000);
				expect(parseDuration('1h')).toBe(60 * 60 * 1000);
				expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
				expect(parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
			});

			test('parses large values', () => {
				expect(parseDuration('365d')).toBe(365 * 24 * 60 * 60 * 1000);
				expect(parseDuration('100h')).toBe(100 * 60 * 60 * 1000);
				expect(parseDuration('1000s')).toBe(1000 * 1000);
			});

			test('parses zero value', () => {
				expect(parseDuration('0s')).toBe(0);
				expect(parseDuration('0m')).toBe(0);
			});
		});
	});

	describe('resolveMeId', () => {
		test('returns undefined when id is undefined', async () => {
			const result = await resolveMeId(undefined, {} as any);
			expect(result).toBeUndefined();
		});

		test('returns original id when not "me"', async () => {
			const ctx = { auth: { userId: 'user_123' } } as any;
			const result = await resolveMeId('user_456', ctx);
			expect(result).toBe('user_456');
		});

		test('resolves "me" to current user id', async () => {
			const ctx = { auth: { userId: 'user_123' } } as any;
			const result = await resolveMeId('me', ctx);
			expect(result).toBe('user_123');
		});

		test('is case sensitive for "me"', async () => {
			const ctx = { auth: { userId: 'user_123' } } as any;
			const result = await resolveMeId('ME', ctx);
			expect(result).toBe('ME');
		});
	});

	describe('parseMetadataFlag', () => {
		test('returns undefined for undefined input', () => {
			expect(parseMetadataFlag(undefined)).toBeUndefined();
		});

		test('parses valid JSON object', () => {
			const result = parseMetadataFlag('{"key":"value","number":42}');
			expect(result).toEqual({ key: 'value', number: 42 });
		});

		test('parses empty object', () => {
			const result = parseMetadataFlag('{}');
			expect(result).toEqual({});
		});

		test('parses nested objects', () => {
			const result = parseMetadataFlag('{"outer":{"inner":"value"}}');
			expect(result).toEqual({ outer: { inner: 'value' } });
		});

		test('parses arrays as values', () => {
			const result = parseMetadataFlag('{"items":[1,2,3]}');
			expect(result).toEqual({ items: [1, 2, 3] });
		});

		test('parses boolean values', () => {
			const result = parseMetadataFlag('{"enabled":true,"disabled":false}');
			expect(result).toEqual({ enabled: true, disabled: false });
		});

		test('parses null values', () => {
			const result = parseMetadataFlag('{"value":null}');
			expect(result).toEqual({ value: null });
		});
	});
});
