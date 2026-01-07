import type { Schema, Infer } from '../base';
import { success, createParseMethods, SCHEMA_KIND } from '../base';

/**
 * Schema for nullable values (T | null).
 * Accepts null or the wrapped schema's type.
 *
 * @template T - The wrapped schema type
 *
 * @example
 * ```typescript
 * const schema = s.nullable(s.string());
 * schema.parse('hello'); // 'hello'
 * schema.parse(null); // null
 * schema.parse(123); // throws ValidationError
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NullableSchema<T extends Schema<any, any>>
	implements Schema<Infer<T> | null, Infer<T> | null>
{
	readonly [SCHEMA_KIND] = 'NullableSchema';
	readonly schema: T;
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value === null) {
				return success(null as Infer<T> | null);
			}
			return this.schema['~standard'].validate(value);
		},
		types: undefined as unknown as { input: Infer<T> | null; output: Infer<T> | null },
	};

	// Type-safe parse methods for this instance
	private parseMethods = createParseMethods<Infer<T> | null>();

	constructor(schema: T) {
		this.schema = schema;
	}

	describe(description: string): this {
		this.description = description;
		return this;
	}

	optional(): Schema<Infer<T> | null | undefined, Infer<T> | null | undefined> {
		// Import here to avoid circular dependency
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { optional } = require('./optional.js');
		return optional(this);
	}

	nullable() {
		return this; // Already nullable
	}

	parse = this.parseMethods.parse;
	safeParse = this.parseMethods.safeParse;
}

/**
 * Make a schema nullable (T | null).
 *
 * @param schema - The schema to make nullable
 *
 * @example
 * ```typescript
 * const userSchema = s.object({
 *   name: s.string(),
 *   bio: s.nullable(s.string())
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nullable<T extends Schema<any, any>>(schema: T): NullableSchema<T> {
	return new NullableSchema(schema);
}
