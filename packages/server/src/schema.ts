import { z } from 'zod';
import {
	toJSONSchema as agentuityToJSONSchema,
	type JSONSchema,
	type ToJSONSchemaOptions,
} from '@agentuity/schema';

/**
 * Converts a schema to JSON Schema format.
 * Supports Agentuity schemas (StandardSchemaV1) and Zod schemas.
 * Returns empty object for unknown schema types.
 *
 * @param schema - The schema to convert
 * @param options - Conversion options (only applies to Agentuity schemas)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toJSONSchema = (schema: any, options?: ToJSONSchemaOptions): JSONSchema => {
	// Check if it's an Agentuity schema via StandardSchemaV1 vendor
	if (schema?.['~standard']?.vendor === 'agentuity') {
		return agentuityToJSONSchema(schema, options);
	}
	// Check if it's a Zod schema
	// Zod 3 uses _def.typeName (e.g., "ZodObject")
	// Zod 4 uses _def.type (e.g., "object")
	if (schema?._def?.typeName || schema?._def?.type) {
		try {
			return z.toJSONSchema(schema) as JSONSchema;
		} catch {
			return {};
		}
	}
	// Unknown schema type
	return {};
};
