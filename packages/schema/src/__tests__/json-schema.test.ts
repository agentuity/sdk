import { describe, test, expect } from 'bun:test';
import { s } from '../index.js';

describe('JSON Schema Conversion', () => {
	describe('toJSONSchema', () => {
		test('should convert primitive types', () => {
			const stringSchema = s.toJSONSchema(s.string());
			expect(stringSchema.type).toBe('string');

			const numberSchema = s.toJSONSchema(s.number());
			expect(numberSchema.type).toBe('number');

			const booleanSchema = s.toJSONSchema(s.boolean());
			expect(booleanSchema.type).toBe('boolean');
		});

		test('should convert object schemas', () => {
			const schema = s.object({
				name: s.string(),
				age: s.number(),
			});

			const jsonSchema = s.toJSONSchema(schema);
			expect(jsonSchema.type).toBe('object');
			expect(jsonSchema.properties).toHaveProperty('name');
			expect(jsonSchema.properties).toHaveProperty('age');
			expect(jsonSchema.required).toContain('name');
			expect(jsonSchema.required).toContain('age');
		});

		test('should convert array schemas', () => {
			const schema = s.array(s.string());
			const jsonSchema = s.toJSONSchema(schema);

			expect(jsonSchema.type).toBe('array');
			expect(jsonSchema.items).toHaveProperty('type', 'string');
		});

		test('should preserve descriptions', () => {
			const schema = s.string().describe('A test string');
			const jsonSchema = s.toJSONSchema(schema);

			expect(jsonSchema.description).toBe('A test string');
		});

		test('should handle optional fields', () => {
			const schema = s.object({
				required: s.string(),
				optional: s.optional(s.string()),
			});

			const jsonSchema = s.toJSONSchema(schema);
			expect(jsonSchema.required).toContain('required');
			expect(jsonSchema.required).not.toContain('optional');
		});

		test('should handle nullable fields', () => {
			const schema = s.nullable(s.string());
			const jsonSchema = s.toJSONSchema(schema);

			expect(jsonSchema.anyOf).toHaveLength(2);
		});
	});

	describe('fromJSONSchema', () => {
		test('should convert primitive types', () => {
			const stringSchema = s.fromJSONSchema({ type: 'string' });
			expect(stringSchema.parse('hello')).toBe('hello');

			const numberSchema = s.fromJSONSchema({ type: 'number' });
			expect(numberSchema.parse(123)).toBe(123);
		});

		test('should convert object schemas', () => {
			const jsonSchema = {
				type: 'object' as const,
				properties: {
					name: { type: 'string' as const },
					age: { type: 'number' as const },
				},
				required: ['name', 'age'],
			};

			const schema = s.fromJSONSchema(jsonSchema);
			const result = schema.parse({
				name: 'John',
				age: 30,
			});

			expect(result).toEqual({ name: 'John', age: 30 });
		});

		test('should convert array schemas', () => {
			const jsonSchema = {
				type: 'array' as const,
				items: { type: 'string' as const },
			};

			const schema = s.fromJSONSchema(jsonSchema);
			const result = schema.parse(['a', 'b', 'c']);

			expect(result).toEqual(['a', 'b', 'c']);
		});

		test('should handle enum values', () => {
			const jsonSchema = {
				enum: ['red', 'green', 'blue'],
			};

			const schema = s.fromJSONSchema(jsonSchema);
			expect(schema.parse('red')).toBe('red');
		});
	});

	describe('round-trip conversion', () => {
		test('should preserve schema through round-trip', () => {
			const original = s.object({
				name: s.string(),
				age: s.number(),
				tags: s.array(s.string()),
			});

			const jsonSchema = s.toJSONSchema(original);
			const reconstructed = s.fromJSONSchema(jsonSchema);

			const testData = {
				name: 'Test',
				age: 25,
				tags: ['tag1', 'tag2'],
			};

			const originalResult = original.parse(testData);
			const reconstructedResult = reconstructed.parse(testData);

			expect(reconstructedResult).toEqual(originalResult);
		});
	});
});
