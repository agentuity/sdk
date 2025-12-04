import type { Schema, Infer } from '../base';
import { success, createParseMethods } from '../base';

/**
 * Schema for optional values (T | undefined).
 * Accepts undefined or the wrapped schema's type.
 *
 * @template T - The wrapped schema type
 *
 * @example
 * ```typescript
 * const schema = s.optional(s.string());
 * schema.parse('hello'); // 'hello'
 * schema.parse(undefined); // undefined
 * schema.parse(123); // throws ValidationError
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class OptionalSchema<T extends Schema<any, any>>
	implements Schema<Infer<T> | undefined, Infer<T> | undefined>
{
	readonly schema: T;
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value === undefined) {
				return success(undefined as Infer<T> | undefined);
			}
			return this.schema['~standard'].validate(value);
		},
		types: undefined as unknown as { input: Infer<T> | undefined; output: Infer<T> | undefined },
	};

	// Type-safe parse methods for this instance
	private parseMethods = createParseMethods<Infer<T> | undefined>();

	constructor(schema: T) {
		this.schema = schema;
	}

	describe(description: string): this {
		this.description = description;
		return this;
	}

	optional() {
		return this; // Already optional
	}

	nullable(): Schema<Infer<T> | undefined | null, Infer<T> | undefined | null> {
		// Import here to avoid circular dependency
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { nullable } = require('./nullable.js');
		return nullable(this);
	}

	parse = this.parseMethods.parse;
	safeParse = this.parseMethods.safeParse;
}

/**
 * Make a schema optional (T | undefined).
 *
 * @param schema - The schema to make optional
 *
 * @example
 * ```typescript
 * const userSchema = s.object({
 *   name: s.string(),
 *   nickname: s.optional(s.string())
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function optional<T extends Schema<any, any>>(schema: T): OptionalSchema<T> {
	return new OptionalSchema(schema);
}
