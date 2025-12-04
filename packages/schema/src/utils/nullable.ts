import type { Schema, Infer } from '../base.js';
import { success, createParseMethods } from '../base.js';

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
	description?: string;
	private parseMethods = createParseMethods<Infer<T> | null>();

	constructor(private schema: T) {}

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value === null) {
				return success(null);
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return this.schema['~standard'].validate(value) as any;
		},
		types: undefined as unknown as { input: Infer<T> | null; output: Infer<T> | null },
	};

	describe(description: string): this {
		this.description = description;
		return this;
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
 *   deletedAt: s.nullable(s.coerce.date())
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nullable<T extends Schema<any, any>>(schema: T): NullableSchema<T> {
	return new NullableSchema(schema);
}
