import { describe, test, expect } from 'bun:test';
import { s, ValidationError } from '../index.js';

describe('Utility Schemas', () => {
	describe('literal', () => {
		test('should validate exact string values', () => {
			const schema = s.literal('admin');
			expect(schema.parse('admin')).toBe('admin');
			expect(() => schema.parse('user')).toThrow(ValidationError);
		});

		test('should validate exact number values', () => {
			const schema = s.literal(42);
			expect(schema.parse(42)).toBe(42);
			expect(() => schema.parse(41)).toThrow(ValidationError);
		});

		test('should validate exact boolean values', () => {
			const schema = s.literal(true);
			expect(schema.parse(true)).toBe(true);
			expect(() => schema.parse(false)).toThrow(ValidationError);
		});
	});

	describe('enum', () => {
		test('should validate enum values', () => {
			const schema = s.enum(['red', 'green', 'blue']);
			expect(schema.parse('red')).toBe('red');
			expect(schema.parse('green')).toBe('green');
			expect(() => schema.parse('yellow')).toThrow(ValidationError);
		});

		test('should work with numbers', () => {
			const schema = s.enum([1, 2, 3]);
			expect(schema.parse(2)).toBe(2);
			expect(() => schema.parse(4)).toThrow(ValidationError);
		});

		test('should work with mixed types', () => {
			const schema = s.enum(['active', 'inactive', 1, 2]);
			expect(schema.parse('active')).toBe('active');
			expect(schema.parse(1)).toBe(1);
			expect(() => schema.parse('pending')).toThrow(ValidationError);
		});
	});

	describe('optional', () => {
		const schema = s.optional(s.string());

		test('should validate undefined', () => {
			expect(schema.parse(undefined)).toBe(undefined);
		});

		test('should validate the wrapped type', () => {
			expect(schema.parse('hello')).toBe('hello');
		});

		test('should reject invalid values', () => {
			expect(() => schema.parse(123)).toThrow(ValidationError);
		});
	});

	describe('nullable', () => {
		const schema = s.nullable(s.string());

		test('should validate null', () => {
			expect(schema.parse(null)).toBe(null);
		});

		test('should validate the wrapped type', () => {
			expect(schema.parse('hello')).toBe('hello');
		});

		test('should reject invalid values', () => {
			expect(() => schema.parse(123)).toThrow(ValidationError);
		});
	});

	describe('union', () => {
		const schema = s.union(s.string(), s.number(), s.boolean());

		test('should validate any union member', () => {
			expect(schema.parse('hello')).toBe('hello');
			expect(schema.parse(123)).toBe(123);
			expect(schema.parse(true)).toBe(true);
		});

		test('should reject non-members', () => {
			expect(() => schema.parse(null)).toThrow(ValidationError);
			expect(() => schema.parse(undefined)).toThrow(ValidationError);
		});

		test('should work with literal union (enum-like)', () => {
			const roleSchema = s.union(s.literal('admin'), s.literal('user'), s.literal('guest'));

			expect(roleSchema.parse('admin')).toBe('admin');
			expect(() => roleSchema.parse('superuser')).toThrow(ValidationError);
		});
	});
});
