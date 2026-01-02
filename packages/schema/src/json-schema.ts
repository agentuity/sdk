/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Schema } from './base';
import { string } from './primitives/string';
import { number } from './primitives/number';
import { boolean } from './primitives/boolean';
import { null_ } from './primitives/null';
import { object } from './complex/object';
import { array } from './complex/array';
import { literal } from './utils/literal';
import { optional } from './utils/optional';
import { nullable } from './utils/nullable';
import { union } from './utils/union';

/**
 * Check schema type by constructor name (works across bundled modules).
 * Using instanceof fails when code is bundled or multiple copies of the package exist.
 */
function isSchemaType(schema: any, typeName: string): boolean {
	return schema?.constructor?.name === typeName;
}

/**
 * JSON Schema object representation.
 * Subset of JSON Schema Draft 7 specification.
 */
export interface JSONSchema {
	type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
	description?: string;
	const?: string | number | boolean;
	enum?: Array<string | number | boolean>;
	properties?: Record<string, JSONSchema>;
	required?: string[];
	items?: JSONSchema;
	anyOf?: JSONSchema[];
	oneOf?: JSONSchema[];
	allOf?: JSONSchema[];
}

/**
 * Convert a schema to JSON Schema format.
 * Supports primitives, objects, arrays, unions, literals, optional, and nullable types.
 *
 * @param schema - The schema to convert
 * @returns JSON Schema object
 *
 * @example
 * ```typescript
 * const userSchema = s.object({
 *   name: s.string().describe('User name'),
 *   age: s.number().describe('User age')
 * });
 *
 * const jsonSchema = s.toJSONSchema(userSchema);
 * // { type: 'object', properties: {...}, required: [...] }
 * ```
 */
export function toJSONSchema(schema: Schema<any, any>): JSONSchema {
	const result: JSONSchema = {};

	// Add description if available
	if (schema.description) {
		result.description = schema.description;
	}

	// Primitive types - use constructor name checks (works across bundled modules)
	if (isSchemaType(schema, 'StringSchema') || isSchemaType(schema, 'CoerceStringSchema')) {
		result.type = 'string';
		return result;
	}

	if (isSchemaType(schema, 'NumberSchema') || isSchemaType(schema, 'CoerceNumberSchema')) {
		result.type = 'number';
		return result;
	}

	if (isSchemaType(schema, 'BooleanSchema') || isSchemaType(schema, 'CoerceBooleanSchema')) {
		result.type = 'boolean';
		return result;
	}

	if (isSchemaType(schema, 'NullSchema')) {
		result.type = 'null';
		return result;
	}

	if (isSchemaType(schema, 'UndefinedSchema')) {
		// JSON Schema doesn't have a direct "undefined" type
		// We can represent it as an empty schema or omit the field
		return {};
	}

	// Literal types
	if (isSchemaType(schema, 'LiteralSchema')) {
		const value = (schema as any).value;
		result.const = value;
		if (typeof value === 'string') {
			result.type = 'string';
		} else if (typeof value === 'number') {
			result.type = 'number';
		} else if (typeof value === 'boolean') {
			result.type = 'boolean';
		}
		return result;
	}

	// Object types
	if (isSchemaType(schema, 'ObjectSchema')) {
		result.type = 'object';
		const shape = (schema as any).shape;
		result.properties = {};
		result.required = [];

		for (const [key, fieldSchema] of Object.entries(shape) as Array<[string, Schema<any, any>]>) {
			result.properties[key] = toJSONSchema(fieldSchema);

			// If the field is not optional, add it to required
			if (!isSchemaType(fieldSchema, 'OptionalSchema')) {
				result.required.push(key);
			}
		}

		// Remove required if empty
		if (result.required.length === 0) {
			delete result.required;
		}

		return result;
	}

	// Array types
	if (isSchemaType(schema, 'ArraySchema')) {
		result.type = 'array';
		const itemSchema = (schema as any).itemSchema;
		result.items = toJSONSchema(itemSchema);
		return result;
	}

	// Optional types
	if (isSchemaType(schema, 'OptionalSchema')) {
		const innerSchema = (schema as any).schema;
		const innerJSON = toJSONSchema(innerSchema);
		// Optional is typically handled at the object level via required array
		return innerJSON;
	}

	// Nullable types
	if (isSchemaType(schema, 'NullableSchema')) {
		const innerSchema = (schema as any).schema;
		const innerJSON = toJSONSchema(innerSchema);
		// Nullable can be represented as anyOf with null
		return {
			anyOf: [innerJSON, { type: 'null' }],
			...(schema.description && { description: schema.description }),
		};
	}

	// Union types
	if (isSchemaType(schema, 'UnionSchema')) {
		const schemas = (schema as any).schemas as Schema<any, any>[];
		result.anyOf = schemas.map((schema) => toJSONSchema(schema));
		return result;
	}

	// Record types (object with string keys and typed values)
	if (isSchemaType(schema, 'RecordSchema')) {
		result.type = 'object';
		// Record schemas have additionalProperties
		const valueSchema = (schema as any).valueSchema;
		if (valueSchema) {
			(result as any).additionalProperties = toJSONSchema(valueSchema);
		}
		return result;
	}

	// Unknown/Any types - accept anything
	if (isSchemaType(schema, 'UnknownSchema') || isSchemaType(schema, 'AnySchema')) {
		// Return empty schema (accepts any value in JSON Schema)
		return result;
	}

	// Coerce date - represented as string in JSON Schema
	if (isSchemaType(schema, 'CoerceDateSchema')) {
		result.type = 'string';
		(result as any).format = 'date-time';
		return result;
	}

	// Fallback for unknown schema types
	return result;
}

/**
 * Convert a JSON Schema object to a schema.
 * Supports round-trip conversion with toJSONSchema.
 *
 * @param jsonSchema - The JSON Schema object to convert
 * @returns Schema instance
 *
 * @example
 * ```typescript
 * const jsonSchema = {
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *     age: { type: 'number' }
 *   },
 *   required: ['name', 'age']
 * };
 *
 * const schema = s.fromJSONSchema(jsonSchema);
 * const user = schema.parse({ name: 'John', age: 30 });
 * ```
 */
export function fromJSONSchema(jsonSchema: JSONSchema): Schema<any, any> {
	// Handle const (literal values)
	if (jsonSchema.const !== undefined) {
		const schema = literal(jsonSchema.const);
		if (jsonSchema.description) {
			schema.describe(jsonSchema.description);
		}
		return schema;
	}

	// Handle anyOf (union or nullable)
	if (jsonSchema.anyOf && Array.isArray(jsonSchema.anyOf)) {
		// Check if it's a nullable pattern (anyOf with one schema and one null)
		if (jsonSchema.anyOf.length === 2) {
			const nullIndex = jsonSchema.anyOf.findIndex((s) => s.type === 'null');
			if (nullIndex !== -1) {
				const otherIndex = nullIndex === 0 ? 1 : 0;
				const innerSchema = fromJSONSchema(jsonSchema.anyOf[otherIndex]);
				const schema = nullable(innerSchema);
				if (jsonSchema.description) {
					schema.describe(jsonSchema.description);
				}
				return schema;
			}
		}

		// Otherwise treat as union
		const schemas = jsonSchema.anyOf.map((s) => fromJSONSchema(s));
		const schema = union(...schemas);
		if (jsonSchema.description) {
			schema.describe(jsonSchema.description);
		}
		return schema;
	}

	// Handle oneOf (union)
	if (jsonSchema.oneOf && Array.isArray(jsonSchema.oneOf)) {
		const schemas = jsonSchema.oneOf.map((s) => fromJSONSchema(s));
		const schema = union(...schemas);
		if (jsonSchema.description) {
			schema.describe(jsonSchema.description);
		}
		return schema;
	}

	// Handle enum (union of literals)
	if (jsonSchema.enum && Array.isArray(jsonSchema.enum)) {
		const schemas = jsonSchema.enum.map((value) => literal(value as string | number | boolean));
		const schema = union(...schemas);
		if (jsonSchema.description) {
			schema.describe(jsonSchema.description);
		}
		return schema;
	}

	// Handle primitive types
	switch (jsonSchema.type) {
		case 'string': {
			const schema = string();
			if (jsonSchema.description) {
				schema.describe(jsonSchema.description);
			}
			return schema;
		}

		case 'number':
		case 'integer': {
			const schema = number();
			if (jsonSchema.description) {
				schema.describe(jsonSchema.description);
			}
			return schema;
		}

		case 'boolean': {
			const schema = boolean();
			if (jsonSchema.description) {
				schema.describe(jsonSchema.description);
			}
			return schema;
		}

		case 'null': {
			const schema = null_();
			if (jsonSchema.description) {
				schema.describe(jsonSchema.description);
			}
			return schema;
		}

		case 'array': {
			if (!jsonSchema.items) {
				throw new Error('Array type must have items property');
			}
			const itemSchema = fromJSONSchema(jsonSchema.items);
			const schema = array(itemSchema);
			if (jsonSchema.description) {
				schema.describe(jsonSchema.description);
			}
			return schema;
		}

		case 'object': {
			if (!jsonSchema.properties) {
				// Empty object schema
				const schema = object({});
				if (jsonSchema.description) {
					schema.describe(jsonSchema.description);
				}
				return schema;
			}

			const shape: Record<string, Schema<any, any>> = {};
			const requiredFields = new Set(jsonSchema.required || []);

			for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
				let fieldSchema = fromJSONSchema(propSchema);

				// If field is not in required array, make it optional
				if (!requiredFields.has(key)) {
					fieldSchema = optional(fieldSchema);
				}

				shape[key] = fieldSchema;
			}

			const schema = object(shape);
			if (jsonSchema.description) {
				schema.describe(jsonSchema.description);
			}
			return schema;
		}

		default: {
			// If no type is specified, try to infer from other properties
			if (jsonSchema.properties) {
				// Treat as object
				return fromJSONSchema({ ...jsonSchema, type: 'object' });
			}
			if (jsonSchema.items) {
				// Treat as array
				return fromJSONSchema({ ...jsonSchema, type: 'array' });
			}
			// Fallback to string schema for unrecognized/untyped JSON Schema
			// This provides a permissive default but may mask schema issues
			return string();
		}
	}
}
