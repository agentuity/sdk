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

describe('object utility methods', () => {
	const userSchema = s.object({
		name: s.string(),
		age: s.number(),
		email: s.string(),
		password: s.string(),
	});

	describe('pick', () => {
		test('should pick specified keys', () => {
			const picked = userSchema.pick(['name', 'email']);
			const result = picked.parse({ name: 'John', email: 'john@example.com' });
			expect(result).toEqual({ name: 'John', email: 'john@example.com' });
		});

		test('should strip extra fields that were not picked', () => {
			const picked = userSchema.pick(['name']);
			const result = picked.parse({ name: 'John', age: 30 });
			expect(result).toEqual({ name: 'John' });
		});

		test('should require picked fields', () => {
			const picked = userSchema.pick(['name', 'age']);
			expect(() => picked.parse({ name: 'John' })).toThrow(ValidationError);
		});
	});

	describe('omit', () => {
		test('should omit specified keys', () => {
			const omitted = userSchema.omit(['password']);
			const result = omitted.parse({ name: 'John', age: 30, email: 'john@example.com' });
			expect(result).toEqual({ name: 'John', age: 30, email: 'john@example.com' });
		});

		test('should not validate omitted fields', () => {
			const omitted = userSchema.omit(['password', 'email']);
			const result = omitted.parse({ name: 'John', age: 30 });
			expect(result).toEqual({ name: 'John', age: 30 });
		});

		test('should still require non-omitted fields', () => {
			const omitted = userSchema.omit(['password']);
			expect(() => omitted.parse({ name: 'John', age: 30 })).toThrow(ValidationError);
		});
	});

	describe('partial', () => {
		test('should make all fields optional', () => {
			const partial = userSchema.partial();
			const result = partial.parse({});
			expect(result).toEqual({});
		});

		test('should accept partial data', () => {
			const partial = userSchema.partial();
			const result = partial.parse({ name: 'John' });
			expect(result).toEqual({ name: 'John' });
		});

		test('should still validate provided fields', () => {
			const partial = userSchema.partial();
			expect(() => partial.parse({ name: 123 })).toThrow(ValidationError);
		});

		test('should accept all fields', () => {
			const partial = userSchema.partial();
			const result = partial.parse({
				name: 'John',
				age: 30,
				email: 'john@example.com',
				password: 'secret',
			});
			expect(result).toEqual({
				name: 'John',
				age: 30,
				email: 'john@example.com',
				password: 'secret',
			});
		});
	});

	describe('extend', () => {
		test('should add new properties', () => {
			const extended = userSchema.extend({
				role: s.string(),
			});
			const result = extended.parse({
				name: 'John',
				age: 30,
				email: 'john@example.com',
				password: 'secret',
				role: 'admin',
			});
			expect(result.role).toBe('admin');
		});

		test('should override existing properties', () => {
			const extended = userSchema.extend({
				age: s.string(),
			});
			const result = extended.parse({
				name: 'John',
				age: 'thirty',
				email: 'john@example.com',
				password: 'secret',
			});
			expect(result.age).toBe('thirty');
		});

		test('should require new properties', () => {
			const extended = userSchema.extend({
				role: s.string(),
			});
			expect(() =>
				extended.parse({
					name: 'John',
					age: 30,
					email: 'john@example.com',
					password: 'secret',
				})
			).toThrow(ValidationError);
		});
	});

	describe('chaining', () => {
		test('should support pick then partial', () => {
			const schema = userSchema.pick(['name', 'age']).partial();
			const result = schema.parse({ name: 'John' });
			expect(result).toEqual({ name: 'John' });
		});

		test('should support omit then extend', () => {
			const schema = userSchema.omit(['password']).extend({ role: s.string() });
			const result = schema.parse({
				name: 'John',
				age: 30,
				email: 'john@example.com',
				role: 'admin',
			});
			expect(result.role).toBe('admin');
		});

		test('should support extend then pick', () => {
			const schema = userSchema.extend({ role: s.string() }).pick(['name', 'role']);
			const result = schema.parse({ name: 'John', role: 'admin' });
			expect(result).toEqual({ name: 'John', role: 'admin' });
		});
	});
});
