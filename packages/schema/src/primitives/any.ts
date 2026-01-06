import type { Schema } from '../base';
import { success, createParseMethods, SCHEMA_KIND } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseMethods = createParseMethods<any>();

/**
 * Schema that accepts any value with 'any' type.
 * Returns the value as-is without validation or type safety.
 * Use this sparingly - prefer unknown() for better type safety.
 *
 * @example
 * ```typescript
 * const schema = s.any();
 * const value = schema.parse(123); // any
 * const value2 = schema.parse('hello'); // any
 *
 * // No type checking required
 * value.toUpperCase(); // No error, but may fail at runtime
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class AnySchema implements Schema<any, any> {
	readonly [SCHEMA_KIND] = 'AnySchema';
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		validate: (value: unknown) => success(value as any),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		types: undefined as unknown as { input: any; output: any },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	optional() {
		return optional(this);
	}

	nullable() {
		return nullable(this);
	}
	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create an any schema that accepts any value.
 *
 * @example
 * ```typescript
 * const schema = s.any();
 * const value = schema.parse(anything); // Type is any
 * ```
 */
export function any(): AnySchema {
	return new AnySchema();
}
