export type {
	Schema,
	Infer,
	InferInput,
	InferOutput,
	ValidationIssue,
	ValidationResult,
	SafeParseResult,
	SafeParseSuccess,
	SafeParseError,
} from './base.js';
export { createIssue, success, failure, ValidationError } from './base.js';

export { StringSchema, string } from './primitives/string.js';
export { NumberSchema, number } from './primitives/number.js';
export { BooleanSchema, boolean } from './primitives/boolean.js';
export { NullSchema, null_ } from './primitives/null.js';
export { UndefinedSchema, undefined_ } from './primitives/undefined.js';

export { ObjectSchema, object } from './complex/object.js';
export { ArraySchema, array } from './complex/array.js';

export { LiteralSchema, literal } from './utils/literal.js';
export { OptionalSchema, optional } from './utils/optional.js';
export { NullableSchema, nullable } from './utils/nullable.js';
export { UnionSchema, union } from './utils/union.js';

export { toJSONSchema, fromJSONSchema, type JSONSchema } from './json-schema.js';

export { CoerceStringSchema, coerceString } from './coerce/string.js';
export { CoerceNumberSchema, coerceNumber } from './coerce/number.js';
export { CoerceBooleanSchema, coerceBoolean } from './coerce/boolean.js';
export { CoerceDateSchema, coerceDate } from './coerce/date.js';

import { string } from './primitives/string.js';
import { number } from './primitives/number.js';
import { boolean } from './primitives/boolean.js';
import { null_ } from './primitives/null.js';
import { undefined_ } from './primitives/undefined.js';
import { object } from './complex/object.js';
import { array } from './complex/array.js';
import { literal } from './utils/literal.js';
import { optional } from './utils/optional.js';
import { nullable } from './utils/nullable.js';
import { union } from './utils/union.js';
import { toJSONSchema, fromJSONSchema } from './json-schema.js';
import { coerceString } from './coerce/string.js';
import { coerceNumber } from './coerce/number.js';
import { coerceBoolean } from './coerce/boolean.js';
import { coerceDate } from './coerce/date.js';

import type { Infer as InferType, Schema } from './base.js';

/**
 * Create an enum schema (union of literal values).
 * Shorthand for creating a union of literals.
 *
 * @param values - Array of literal values
 *
 * @example
 * ```typescript
 * const roleSchema = s.enum(['admin', 'user', 'guest']);
 * const role = roleSchema.parse('admin'); // 'admin'
 *
 * // Equivalent to:
 * s.union(s.literal('admin'), s.literal('user'), s.literal('guest'))
 * ```
 */
function enumSchema<
	T extends readonly [string | number | boolean, ...(string | number | boolean)[]],
>(values: T) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return union(...values.map((v) => literal(v as any)));
}

/**
 * Main schema builder object.
 * Provides access to all schema types and utilities.
 *
 * @example
 * ```typescript
 * import { s } from '@agentuity/schema';
 *
 * // Define a schema
 * const User = s.object({
 *   name: s.string(),
 *   age: s.number(),
 *   role: s.enum(['admin', 'user'])
 * });
 *
 * // Extract type
 * type User = s.infer<typeof User>;
 *
 * // Parse data
 * const user = User.parse(data);
 * ```
 */
export const s = {
	/** Create a string schema */
	string,
	/** Create a number schema */
	number,
	/** Create a boolean schema */
	boolean,
	/** Create a null schema */
	null: null_,
	/** Create an undefined schema */
	undefined: undefined_,
	/** Create an object schema with typed properties */
	object,
	/** Create an array schema with typed elements */
	array,
	/** Create a literal value schema */
	literal,
	/** Make a schema optional (T | undefined) */
	optional,
	/** Make a schema nullable (T | null) */
	nullable,
	/** Create a union of schemas */
	union,
	/** Create an enum schema (union of literals) */
	enum: enumSchema,
	/** Convert schema to JSON Schema format */
	toJSONSchema,
	/** Convert JSON Schema to schema */
	fromJSONSchema,
	/** Coercion schemas for type conversion */
	coerce: {
		/** Coerce to string using String(value) */
		string: coerceString,
		/** Coerce to number using Number(value) */
		number: coerceNumber,
		/** Coerce to boolean using Boolean(value) */
		boolean: coerceBoolean,
		/** Coerce to Date using new Date(value) */
		date: coerceDate,
	},
};

/**
 * Namespace for s.infer type extraction (like zod's z.infer).
 *
 * @example
 * ```typescript
 * const User = s.object({ name: s.string(), age: s.number() });
 * type User = s.infer<typeof User>;
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace s {
	/**
	 * Extract the TypeScript type from a schema (like zod's z.infer).
	 *
	 * @template T - The schema type
	 *
	 * @example
	 * ```typescript
	 * const Player = s.object({ username: s.string(), xp: s.number() });
	 * type Player = s.infer<typeof Player>;
	 * // { username: string; xp: number }
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type infer<T extends Schema<any, any>> = InferType<T>;
}
