import { z } from 'zod';

/**
 * JSON Schema object. Loosely typed because we don't validate the
 * shape ourselves — callers feed it to consumers (LLM tooling, OpenAPI
 * generators, etc.) that have their own validation.
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Converts a Zod schema to JSON Schema format.
 *
 * Returns an empty object for non-Zod inputs so callers can pass
 * whatever they have without crashing.
 *
 * @param schema - The Zod schema to convert
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toJSONSchema = (schema: any): JSONSchema => {
	// Zod 3 uses _def.typeName (e.g., "ZodObject")
	// Zod 4 uses _def.type (e.g., "object")
	if (schema?._def?.typeName || schema?._def?.type) {
		try {
			return z.toJSONSchema(schema) as JSONSchema;
		} catch {
			return {};
		}
	}
	return {};
};
