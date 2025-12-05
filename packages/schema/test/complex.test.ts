import { describe, test, expect } from 'bun:test';
import { s, ValidationError } from '../src/index.js';

describe('Complex Schemas', () => {
	describe('object', () => {
		const schema = s.object({
			name: s.string(),
			age: s.number(),
			active: s.boolean(),
		});

		test('should validate objects', () => {
			const result = schema.parse({
				name: 'John',
				age: 30,
				active: true,
			});
			expect(result.name).toBe('John');
			expect(result.age).toBe(30);
			expect(result.active).toBe(true);
		});

		test('should reject invalid objects', () => {
			expect(() =>
				schema.parse({
					name: 'John',
					age: 'thirty',
					active: true,
				})
			).toThrow(ValidationError);
		});

		test('should report field path in errors', () => {
			try {
				schema.parse({
					name: 'John',
					age: 'invalid',
					active: true,
				});
				throw new Error('Expected parse to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(error.issues[0].path).toEqual(['age']);
				} else {
					throw error;
				}
			}
		});

		test('should work with nested objects', () => {
			const nested = s.object({
				user: s.object({
					name: s.string(),
					email: s.string(),
				}),
			});

			const result = nested.parse({
				user: {
					name: 'Alice',
					email: 'alice@example.com',
				},
			});
			expect(result.user.name).toBe('Alice');
		});
	});

	describe('array', () => {
		const schema = s.array(s.string());

		test('should validate arrays', () => {
			const result = schema.parse(['a', 'b', 'c']);
			expect(result).toEqual(['a', 'b', 'c']);
		});

		test('should reject non-arrays', () => {
			expect(() => schema.parse('not-an-array')).toThrow(ValidationError);
		});

		test('should validate array items', () => {
			expect(() => schema.parse(['a', 123, 'c'])).toThrow(ValidationError);
		});

		test('should report array index in errors', () => {
			try {
				schema.parse(['a', 123, 'c']);
				throw new Error('Expected parse to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(error.issues[0].path).toContain(1);
				} else {
					throw error;
				}
			}
		});

		test('should work with array of objects', () => {
			const objArray = s.array(
				s.object({
					id: s.number(),
					name: s.string(),
				})
			);

			const result = objArray.parse([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
			]);
			expect(result.length).toBe(2);
			expect(result[0].id).toBe(1);
		});
	});
});
describe('record', () => {
	const schema = s.record(s.string(), s.number());
	test('should validate records', () => {
		expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
	});
	test('should reject non-objects', () => {
		expect(() => schema.parse([])).toThrow(ValidationError);
	});
});
