import { describe, test, expect } from 'bun:test';
import { s, SCHEMA_KIND } from '../src/index.js';

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

	/* eslint-disable @typescript-eslint/no-explicit-any */
	describe('SCHEMA_KIND (minification-safe type detection)', () => {
		test('all primitive schemas should have SCHEMA_KIND tag', () => {
			expect((s.string() as any)[SCHEMA_KIND]).toBe('StringSchema');
			expect((s.number() as any)[SCHEMA_KIND]).toBe('NumberSchema');
			expect((s.boolean() as any)[SCHEMA_KIND]).toBe('BooleanSchema');
			expect((s.null() as any)[SCHEMA_KIND]).toBe('NullSchema');
			expect((s.undefined() as any)[SCHEMA_KIND]).toBe('UndefinedSchema');
			expect((s.unknown() as any)[SCHEMA_KIND]).toBe('UnknownSchema');
			expect((s.any() as any)[SCHEMA_KIND]).toBe('AnySchema');
		});

		test('all complex schemas should have SCHEMA_KIND tag', () => {
			expect((s.object({}) as any)[SCHEMA_KIND]).toBe('ObjectSchema');
			expect((s.array(s.string()) as any)[SCHEMA_KIND]).toBe('ArraySchema');
			expect((s.record(s.string(), s.number()) as any)[SCHEMA_KIND]).toBe('RecordSchema');
		});

		test('all utility schemas should have SCHEMA_KIND tag', () => {
			expect((s.literal('test') as any)[SCHEMA_KIND]).toBe('LiteralSchema');
			expect((s.optional(s.string()) as any)[SCHEMA_KIND]).toBe('OptionalSchema');
			expect((s.nullable(s.string()) as any)[SCHEMA_KIND]).toBe('NullableSchema');
			expect((s.union(s.string(), s.number()) as any)[SCHEMA_KIND]).toBe('UnionSchema');
		});

		test('all coerce schemas should have SCHEMA_KIND tag', () => {
			expect((s.coerce.string() as any)[SCHEMA_KIND]).toBe('CoerceStringSchema');
			expect((s.coerce.number() as any)[SCHEMA_KIND]).toBe('CoerceNumberSchema');
			expect((s.coerce.boolean() as any)[SCHEMA_KIND]).toBe('CoerceBooleanSchema');
			expect((s.coerce.date() as any)[SCHEMA_KIND]).toBe('CoerceDateSchema');
		});

		test('toJSONSchema works when constructor.name is mangled (simulated minification)', () => {
			const stringSchema = s.string().describe('User name');
			const objectSchema = s.object({
				name: s.string(),
				age: s.number(),
			});
			const arraySchema = s.array(s.boolean());
			const unionSchema = s.union(s.string(), s.number());

			// Simulate minification by overriding constructor.name
			// This would break the old implementation that relied on constructor.name
			Object.defineProperty(stringSchema.constructor, 'name', { value: 'a', configurable: true });
			Object.defineProperty(objectSchema.constructor, 'name', { value: 'b', configurable: true });
			Object.defineProperty(arraySchema.constructor, 'name', { value: 'c', configurable: true });
			Object.defineProperty(unionSchema.constructor, 'name', { value: 'd', configurable: true });

			// Verify constructor.name is actually mangled
			expect(stringSchema.constructor.name).toBe('a');
			expect(objectSchema.constructor.name).toBe('b');

			// But SCHEMA_KIND tag is still present
			expect((stringSchema as any)[SCHEMA_KIND]).toBe('StringSchema');
			expect((objectSchema as any)[SCHEMA_KIND]).toBe('ObjectSchema');

			// And toJSONSchema should still work correctly
			const stringJson = s.toJSONSchema(stringSchema);
			expect(stringJson.type).toBe('string');
			expect(stringJson.description).toBe('User name');

			const objectJson = s.toJSONSchema(objectSchema);
			expect(objectJson.type).toBe('object');
			expect(objectJson.properties).toHaveProperty('name');
			expect(objectJson.properties).toHaveProperty('age');
			expect(objectJson.required).toContain('name');
			expect(objectJson.required).toContain('age');

			const arrayJson = s.toJSONSchema(arraySchema);
			expect(arrayJson.type).toBe('array');
			expect(arrayJson.items).toHaveProperty('type', 'boolean');

			const unionJson = s.toJSONSchema(unionSchema);
			expect(unionJson.anyOf).toHaveLength(2);
		});

		test('SCHEMA_KIND uses Symbol.for for cross-bundle compatibility', () => {
			// Verify that SCHEMA_KIND uses Symbol.for (global registry)
			// This ensures the same symbol is used across different bundle copies
			const localSymbol = Symbol.for('@agentuity/schema-kind');
			expect(SCHEMA_KIND).toBe(localSymbol);

			// Schemas created here should be identifiable by the global symbol
			const schema = s.string();
			expect((schema as any)[localSymbol]).toBe('StringSchema');
		});

		test('comprehensive toJSONSchema test for all schema types', () => {
			// Test all schema types produce correct JSON Schema output
			const schemas = [
				{ schema: s.string(), expectedType: 'string' },
				{ schema: s.number(), expectedType: 'number' },
				{ schema: s.boolean(), expectedType: 'boolean' },
				{ schema: s.null(), expectedType: 'null' },
				{ schema: s.coerce.string(), expectedType: 'string' },
				{ schema: s.coerce.number(), expectedType: 'number' },
				{ schema: s.coerce.boolean(), expectedType: 'boolean' },
			];

			for (const { schema, expectedType } of schemas) {
				const jsonSchema = s.toJSONSchema(schema);
				expect(jsonSchema.type).toBe(expectedType);
			}

			// Object schema
			const objSchema = s.object({ x: s.number() });
			const objJson = s.toJSONSchema(objSchema);
			expect(objJson.type).toBe('object');
			expect(objJson.properties?.x?.type).toBe('number');

			// Array schema
			const arrSchema = s.array(s.string());
			const arrJson = s.toJSONSchema(arrSchema);
			expect(arrJson.type).toBe('array');
			expect(arrJson.items?.type).toBe('string');

			// Literal schema
			const litSchema = s.literal('hello');
			const litJson = s.toJSONSchema(litSchema);
			expect(litJson.const).toBe('hello');
			expect(litJson.type).toBe('string');

			// Nullable schema
			const nullableSchema = s.nullable(s.number());
			const nullableJson = s.toJSONSchema(nullableSchema);
			expect(nullableJson.anyOf).toHaveLength(2);

			// Union schema
			const unionSchema = s.union(s.string(), s.number(), s.boolean());
			const unionJson = s.toJSONSchema(unionSchema);
			expect(unionJson.anyOf).toHaveLength(3);

			// Record schema
			const recordSchema = s.record(s.string(), s.number());
			const recordJson = s.toJSONSchema(recordSchema);
			expect(recordJson.type).toBe('object');
			expect((recordJson as any).additionalProperties?.type).toBe('number');

			// Coerce date schema
			const dateSchema = s.coerce.date();
			const dateJson = s.toJSONSchema(dateSchema);
			expect(dateJson.type).toBe('string');
			expect((dateJson as any).format).toBe('date-time');
		});
	});
	/* eslint-enable @typescript-eslint/no-explicit-any */
});
