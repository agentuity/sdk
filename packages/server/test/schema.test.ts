import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { s } from '@agentuity/schema';
import { toJSONSchema } from '../src/schema';

describe('toJSONSchema', () => {
	describe('Zod schemas', () => {
		test('converts z.object() to JSON Schema', () => {
			const schema = z.object({
				name: z.string(),
				age: z.number(),
			});

			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'object');
			expect(result).toHaveProperty('properties');
			expect(result.properties).toHaveProperty('name');
			expect(result.properties).toHaveProperty('age');
			expect(result).toHaveProperty('required');
			expect(result.required).toContain('name');
			expect(result.required).toContain('age');
		});

		test('converts z.string() to JSON Schema', () => {
			const schema = z.string();
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'string');
		});

		test('converts z.number() to JSON Schema', () => {
			const schema = z.number();
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'number');
		});

		test('converts z.boolean() to JSON Schema', () => {
			const schema = z.boolean();
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'boolean');
		});

		test('converts z.array() to JSON Schema', () => {
			const schema = z.array(z.string());
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'array');
			expect(result).toHaveProperty('items');
			expect(result.items).toHaveProperty('type', 'string');
		});

		test('converts z.optional() to JSON Schema', () => {
			const schema = z.object({
				name: z.string(),
				nickname: z.string().optional(),
			});
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'object');
			expect(result.required).toContain('name');
			expect(result.required).not.toContain('nickname');
		});

		test('converts nested z.object() to JSON Schema', () => {
			const schema = z.object({
				user: z.object({
					name: z.string(),
					email: z.string(),
				}),
			});
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'object');
			expect(result.properties).toHaveProperty('user');
			expect(result.properties.user).toHaveProperty('type', 'object');
			expect(result.properties.user.properties).toHaveProperty('name');
			expect(result.properties.user.properties).toHaveProperty('email');
		});

		test('converts z.enum() to JSON Schema', () => {
			const schema = z.enum(['admin', 'user', 'guest']);
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('enum');
			expect(result.enum).toContain('admin');
			expect(result.enum).toContain('user');
			expect(result.enum).toContain('guest');
		});
	});

	describe('Agentuity schemas', () => {
		test('converts s.object() to JSON Schema', () => {
			const schema = s.object({
				name: s.string(),
				age: s.number(),
			});

			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'object');
			expect(result).toHaveProperty('properties');
			expect(result.properties).toHaveProperty('name');
			expect(result.properties).toHaveProperty('age');
		});

		test('converts s.string() to JSON Schema', () => {
			const schema = s.string();
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'string');
		});

		test('converts s.number() to JSON Schema', () => {
			const schema = s.number();
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'number');
		});

		test('converts s.boolean() to JSON Schema', () => {
			const schema = s.boolean();
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'boolean');
		});

		test('converts s.array() to JSON Schema', () => {
			const schema = s.array(s.string());
			const result = toJSONSchema(schema);

			expect(result).toHaveProperty('type', 'array');
			expect(result).toHaveProperty('items');
			expect(result.items).toHaveProperty('type', 'string');
		});
	});

	describe('Unknown schemas', () => {
		test('returns empty object for null', () => {
			const result = toJSONSchema(null);
			expect(result).toEqual({});
		});

		test('returns empty object for undefined', () => {
			const result = toJSONSchema(undefined);
			expect(result).toEqual({});
		});

		test('returns empty object for plain object', () => {
			const result = toJSONSchema({ foo: 'bar' });
			expect(result).toEqual({});
		});

		test('returns empty object for string', () => {
			const result = toJSONSchema('not a schema');
			expect(result).toEqual({});
		});

		test('returns empty object for number', () => {
			const result = toJSONSchema(42);
			expect(result).toEqual({});
		});

		test('returns empty object when z.toJSONSchema throws', () => {
			// Object that passes the Zod detection but fails conversion
			const invalidZodLike = { _def: { type: 'invalid' } };
			const result = toJSONSchema(invalidZodLike);
			expect(result).toEqual({});
		});
	});
});
