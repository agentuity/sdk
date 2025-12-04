import type { Schema } from '../base';
import { success, createParseMethods } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

const parseMethods = createParseMethods<unknown>();

/**
 * Schema that accepts any value with type-safe unknown.
 * Returns the value as-is without validation.
 * Use this when you want to accept any value but force type checking at usage site.
 *
 * @example
 * ```typescript
 * const schema = s.unknown();
 * const value = schema.parse(123); // unknown
 * const value2 = schema.parse('hello'); // unknown
 * const value3 = schema.parse(null); // unknown
 *
 * // Forces type narrowing
 * if (typeof value === 'string') {
 *   console.log(value.toUpperCase());
 * }
 * ```
 */
export class UnknownSchema implements Schema<unknown, unknown> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => success(value),
		types: undefined as unknown as { input: unknown; output: unknown },
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
 * Create an unknown schema that accepts any value.
 *
 * @example
 * ```typescript
 * const schema = s.unknown();
 * const value = schema.parse(anything); // Type is unknown
 * ```
 */
export function unknown(): UnknownSchema {
	return new UnknownSchema();
}
