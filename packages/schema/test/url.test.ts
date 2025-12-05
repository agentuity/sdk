import { describe, expect, test } from 'bun:test';
import { s, ValidationError } from '../src';

describe('URL Validation', () => {
	test('should validate valid URLs', () => {
		const schema = s.string().url();

		expect(schema.parse('https://example.com')).toBe('https://example.com');
		expect(schema.parse('http://example.com')).toBe('http://example.com');
		expect(schema.parse('https://example.com/path')).toBe('https://example.com/path');
		expect(schema.parse('https://example.com:8080')).toBe('https://example.com:8080');
		expect(schema.parse('https://example.com?query=value')).toBe(
			'https://example.com?query=value'
		);
		expect(schema.parse('https://example.com#fragment')).toBe('https://example.com#fragment');
	});

	test('should reject invalid URLs', () => {
		const schema = s.string().url();

		expect(() => schema.parse('invalid')).toThrow(ValidationError);
		expect(() => schema.parse('not a url')).toThrow(ValidationError);
		expect(() => schema.parse('example.com')).toThrow(ValidationError);
		expect(() => schema.parse('')).toThrow(ValidationError);
	});

	test('should work with safeParse', () => {
		const schema = s.string().url();

		const valid = schema.safeParse('https://example.com');
		expect(valid.success).toBe(true);
		if (valid.success) {
			expect(valid.data).toBe('https://example.com');
		}

		const invalid = schema.safeParse('invalid');
		expect(invalid.success).toBe(false);
	});

	test('should work with other validators', () => {
		const schema = s.string().url().min(10);

		expect(schema.parse('https://example.com')).toBe('https://example.com');
		expect(() => schema.parse('http://a')).toThrow(ValidationError);
	});
});
