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

		test('min() should enforce minimum length', () => {
			const minSchema = s.string().min(3);
			expect(minSchema.parse('hello')).toBe('hello');
			expect(minSchema.parse('abc')).toBe('abc');
			expect(() => minSchema.parse('ab')).toThrow(ValidationError);
		});

		test('max() should enforce maximum length', () => {
			const maxSchema = s.string().max(5);
			expect(maxSchema.parse('hello')).toBe('hello');
			expect(maxSchema.parse('hi')).toBe('hi');
			expect(() => maxSchema.parse('toolong')).toThrow(ValidationError);
		});

		test('should chain min and max', () => {
			const rangeSchema = s.string().min(3).max(10);
			expect(rangeSchema.parse('hello')).toBe('hello');
			expect(() => rangeSchema.parse('ab')).toThrow(ValidationError);
			expect(() => rangeSchema.parse('this is too long')).toThrow(ValidationError);
		});
	});

	describe('number', () => {
		const schema = s.number();

		test('should validate numbers', () => {
			expect(schema.parse(123)).toBe(123);
			expect(schema.parse(0)).toBe(0);
			expect(schema.parse(-45.67)).toBe(-45.67);
			expect(schema.parse(Infinity)).toBe(Infinity);
			expect(schema.parse(-Infinity)).toBe(-Infinity);
		});

		test('should reject non-numbers', () => {
			expect(() => schema.parse('123')).toThrow(ValidationError);
			expect(() => schema.parse(true)).toThrow(ValidationError);
			expect(() => schema.parse(NaN)).toThrow(ValidationError);
		});

		test('finite() should reject Infinity', () => {
			const finiteSchema = s.number().finite();
			expect(finiteSchema.parse(123)).toBe(123);
			expect(finiteSchema.parse(0)).toBe(0);
			expect(finiteSchema.parse(-45.67)).toBe(-45.67);
			expect(() => finiteSchema.parse(Infinity)).toThrow(ValidationError);
			expect(() => finiteSchema.parse(-Infinity)).toThrow(ValidationError);
		});

		test('min() should enforce minimum', () => {
			const minSchema = s.number().min(0);
			expect(minSchema.parse(0)).toBe(0);
			expect(minSchema.parse(10)).toBe(10);
			expect(() => minSchema.parse(-1)).toThrow(ValidationError);
		});

		test('max() should enforce maximum', () => {
			const maxSchema = s.number().max(100);
			expect(maxSchema.parse(100)).toBe(100);
			expect(maxSchema.parse(50)).toBe(50);
			expect(() => maxSchema.parse(101)).toThrow(ValidationError);
		});

		test('should chain min and max', () => {
			const rangeSchema = s.number().min(0).max(100);
			expect(rangeSchema.parse(50)).toBe(50);
			expect(() => rangeSchema.parse(-1)).toThrow(ValidationError);
			expect(() => rangeSchema.parse(101)).toThrow(ValidationError);
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

	describe('unknown', () => {
		const schema = s.unknown();

		test('should accept any value', () => {
			expect(schema.parse(123)).toBe(123);
			expect(schema.parse('hello')).toBe('hello');
			expect(schema.parse(true)).toBe(true);
			expect(schema.parse(null)).toBe(null);
			expect(schema.parse(undefined)).toBe(undefined);
			expect(schema.parse({ foo: 'bar' })).toEqual({ foo: 'bar' });
			expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
		});

		test('should work with safeParse', () => {
			const result = schema.safeParse('anything');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe('anything');
			}
		});
	});

	describe('any', () => {
		const schema = s.any();

		test('should accept any value', () => {
			expect(schema.parse(123)).toBe(123);
			expect(schema.parse('hello')).toBe('hello');
			expect(schema.parse(true)).toBe(true);
			expect(schema.parse(null)).toBe(null);
			expect(schema.parse(undefined)).toBe(undefined);
			expect(schema.parse({ foo: 'bar' })).toEqual({ foo: 'bar' });
			expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
		});

		test('should work with safeParse', () => {
			const result = schema.safeParse('anything');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe('anything');
			}
		});
	});
});
