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
} from './base.ts';
export { createIssue, success, failure, ValidationError, SCHEMA_KIND } from './base.ts';

export { StringSchema, string } from './primitives/string.ts';
export { NumberSchema, number } from './primitives/number.ts';
export { BooleanSchema, boolean } from './primitives/boolean.ts';
export { NullSchema, null_ } from './primitives/null.ts';
export { UndefinedSchema, undefined_ } from './primitives/undefined.ts';
export { UnknownSchema, unknown } from './primitives/unknown.ts';
export { AnySchema, any } from './primitives/any.ts';

export { ObjectSchema, object } from './complex/object.ts';
export { ArraySchema, array } from './complex/array.ts';
export { RecordSchema, record } from './complex/record.ts';

export { LiteralSchema, literal } from './utils/literal.ts';
export { OptionalSchema, optional } from './utils/optional.ts';
export { NullableSchema, nullable } from './utils/nullable.ts';
export { UnionSchema, union } from './utils/union.ts';

export {
	toJSONSchema,
	fromJSONSchema,
	type JSONSchema,
	type ToJSONSchemaOptions,
} from './json-schema.ts';

export { CoerceStringSchema, coerceString } from './coerce/string.ts';
export { CoerceNumberSchema, coerceNumber } from './coerce/number.ts';
export { CoerceBooleanSchema, coerceBoolean } from './coerce/boolean.ts';
export { CoerceDateSchema, coerceDate } from './coerce/date.ts';

import { string } from './primitives/string.ts';
import { number } from './primitives/number.ts';
import { boolean } from './primitives/boolean.ts';
import { null_ } from './primitives/null.ts';
import { undefined_ } from './primitives/undefined.ts';
import { unknown } from './primitives/unknown.ts';
import { any } from './primitives/any.ts';
import { object } from './complex/object.ts';
import { array } from './complex/array.ts';
import { record } from './complex/record.ts';
import { literal } from './utils/literal.ts';
import { optional } from './utils/optional.ts';
import { nullable } from './utils/nullable.ts';
import { union } from './utils/union.ts';
import { toJSONSchema, fromJSONSchema } from './json-schema.ts';
import { coerceString } from './coerce/string.ts';
import { coerceNumber } from './coerce/number.ts';
import { coerceBoolean } from './coerce/boolean.ts';
import { coerceDate } from './coerce/date.ts';

import type { Infer as InferType, Schema } from './base.ts';
import type { LiteralSchema } from './utils/literal.ts';
import type { UnionSchema } from './utils/union.ts';

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
	const T extends readonly [string | number | boolean, ...(string | number | boolean)[]],
>(values: T): UnionSchema<LiteralSchema<T[number]>[]> {
	return union(...values.map((v) => literal(v))) as UnionSchema<LiteralSchema<T[number]>[]>;
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
	/** Create an unknown schema (accepts any value) */
	unknown,
	/** Create an any schema (accepts any value) */
	any,
	/** Create an object schema with typed properties */
	object,
	/** Create an array schema with typed elements */
	array,
	/** Create a record schema (object with string keys and typed values) */
	record,
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
