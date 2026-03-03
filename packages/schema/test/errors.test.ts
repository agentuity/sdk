import { describe, test, expect } from 'bun:test';
import { s, ValidationError } from '../src/index.js';

describe('Error Handling', () => {
	describe('ValidationError', () => {
		test('should contain issues array', () => {
			const schema = s.string();

			try {
				schema.parse(123);
				throw new Error('Expected parse to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(Array.isArray(error.issues)).toBe(true);
					expect(error.issues.length).toBeGreaterThan(0);
				} else {
					throw error;
				}
			}
		});

		test('should include field paths', () => {
			const schema = s.object({
				user: s.object({
					name: s.string(),
				}),
			});

			try {
				schema.parse({
					user: {
						name: 123,
					},
				});
				throw new Error('Expected parse to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(error.issues[0].path).toEqual(['user', 'name']);
				} else {
					throw error;
				}
			}
		});

		test('should have readable error message', () => {
			const schema = s.object({
				age: s.number(),
			});

			try {
				schema.parse({ age: 'invalid' });
				throw new Error('Expected parse to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(error.message).toContain('age');
					expect(error.message).toContain('number');
				} else {
					throw error;
				}
			}
		});
	});

	describe('safeParse', () => {
		test('should not throw on invalid data', () => {
			const schema = s.string();
			const result = schema.safeParse(123);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBeInstanceOf(ValidationError);
			}
		});

		test('should return data on valid input', () => {
			const schema = s.string();
			const result = schema.safeParse('hello');

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe('hello');
			}
		});
	});

	describe('parse', () => {
		test('should throw ValidationError on invalid data', () => {
			const schema = s.number();

			expect(() => schema.parse('not-a-number')).toThrow(ValidationError);
		});

		test('should return typed data on valid input', () => {
			const schema = s.number();
			const result = schema.parse(42);

			expect(result).toBe(42);
		});
	});

	describe('multiple errors', () => {
		test('should collect all validation errors', () => {
			const schema = s.object({
				name: s.string(),
				age: s.number(),
				email: s.string(),
			});

			try {
				schema.parse({
					name: 123,
					age: 'invalid',
					email: false,
				});
				throw new Error('Expected parse to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(error.issues.length).toBe(3);
				} else {
					throw error;
				}
			}
		});
	});
});
