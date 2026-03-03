import { describe, test, expect } from 'bun:test';
import { s, ValidationError } from '../src/index.js';

describe('Coercion Schemas', () => {
	describe('coerce.string', () => {
		const schema = s.coerce.string();

		test('should coerce numbers to strings', () => {
			expect(schema.parse(123)).toBe('123');
		});

		test('should coerce booleans to strings', () => {
			expect(schema.parse(true)).toBe('true');
			expect(schema.parse(false)).toBe('false');
		});

		test('should keep strings as-is', () => {
			expect(schema.parse('hello')).toBe('hello');
		});
	});

	describe('coerce.number', () => {
		const schema = s.coerce.number();

		test('should coerce string numbers', () => {
			expect(schema.parse('123')).toBe(123);
			expect(schema.parse('45.67')).toBe(45.67);
		});

		test('should coerce booleans', () => {
			expect(schema.parse(true)).toBe(1);
			expect(schema.parse(false)).toBe(0);
		});

		test('should keep numbers as-is', () => {
			expect(schema.parse(42)).toBe(42);
		});

		test('should reject invalid coercions', () => {
			expect(() => schema.parse('not-a-number')).toThrow(ValidationError);
			expect(() => schema.parse(NaN)).toThrow(ValidationError);
		});
	});

	describe('coerce.boolean', () => {
		const schema = s.coerce.boolean();

		test('should coerce truthy values', () => {
			expect(schema.parse(1)).toBe(true);
			expect(schema.parse('hello')).toBe(true);
			expect(schema.parse([])).toBe(true);
		});

		test('should coerce falsy values', () => {
			expect(schema.parse(0)).toBe(false);
			expect(schema.parse('')).toBe(false);
			expect(schema.parse(null)).toBe(false);
			expect(schema.parse(undefined)).toBe(false);
		});
	});

	describe('coerce.date', () => {
		const schema = s.coerce.date();

		test('should coerce ISO strings', () => {
			const result = schema.parse('2025-01-01');
			expect(result).toBeInstanceOf(Date);
			expect(result.getFullYear()).toBe(2025);
		});

		test('should coerce timestamps', () => {
			const timestamp = Date.now();
			const result = schema.parse(timestamp);
			expect(result).toBeInstanceOf(Date);
			expect(result.getTime()).toBe(timestamp);
		});

		test('should keep dates as-is', () => {
			const date = new Date('2025-01-01');
			const result = schema.parse(date);
			expect(result).toBe(date);
		});

		test('should reject invalid dates', () => {
			expect(() => schema.parse('invalid-date')).toThrow(ValidationError);
		});
	});
});
