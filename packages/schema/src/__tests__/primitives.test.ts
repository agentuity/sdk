import { describe, test, expect } from 'bun:test';
import { s, ValidationError } from '../index.js';

describe('Primitive Schemas', () => {
	describe('string', () => {
		const schema = s.string();

		test('should validate strings', () => {
			expect(schema.parse('hello')).toBe('hello');
			expect(schema.parse('')).toBe('');
		});

		test('should reject non-strings', () => {
			expect(() => schema.parse(123)).toThrow(ValidationError);
			expect(() => schema.parse(true)).toThrow(ValidationError);
			expect(() => schema.parse(null)).toThrow(ValidationError);
		});

		test('should work with safeParse', () => {
			const result = schema.safeParse('test');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe('test');
			}

			const badResult = schema.safeParse(123);
			expect(badResult.success).toBe(false);
		});
	});

	describe('number', () => {
		const schema = s.number();

		test('should validate numbers', () => {
			expect(schema.parse(123)).toBe(123);
			expect(schema.parse(0)).toBe(0);
			expect(schema.parse(-45.67)).toBe(-45.67);
		});

		test('should reject non-numbers', () => {
			expect(() => schema.parse('123')).toThrow(ValidationError);
			expect(() => schema.parse(true)).toThrow(ValidationError);
			expect(() => schema.parse(NaN)).toThrow(ValidationError);
		});
	});

	describe('boolean', () => {
		const schema = s.boolean();

		test('should validate booleans', () => {
			expect(schema.parse(true)).toBe(true);
			expect(schema.parse(false)).toBe(false);
		});

		test('should reject non-booleans', () => {
			expect(() => schema.parse('true')).toThrow(ValidationError);
			expect(() => schema.parse(1)).toThrow(ValidationError);
			expect(() => schema.parse(0)).toThrow(ValidationError);
		});
	});

	describe('null', () => {
		const schema = s.null();

		test('should validate null', () => {
			expect(schema.parse(null)).toBe(null);
		});

		test('should reject non-null', () => {
			expect(() => schema.parse(undefined)).toThrow(ValidationError);
			expect(() => schema.parse(0)).toThrow(ValidationError);
		});
	});

	describe('undefined', () => {
		const schema = s.undefined();

		test('should validate undefined', () => {
			expect(schema.parse(undefined)).toBe(undefined);
		});

		test('should reject non-undefined', () => {
			expect(() => schema.parse(null)).toThrow(ValidationError);
			expect(() => schema.parse(0)).toThrow(ValidationError);
		});
	});
});
