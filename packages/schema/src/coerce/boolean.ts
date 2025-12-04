import type { Schema } from '../base.js';
import { success, createParseMethods } from '../base.js';

const parseMethods = createParseMethods<boolean>();

/**
 * Schema that coerces values to booleans using Boolean(value).
 * Uses JavaScript truthy/falsy rules.
 *
 * @example
 * ```typescript
 * const schema = s.coerce.boolean();
 * schema.parse(1); // true
 * schema.parse(0); // false
 * schema.parse(''); // false
 * schema.parse('hello'); // true
 * ```
 */
export class CoerceBooleanSchema implements Schema<unknown, boolean> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			// Coerce to boolean using JavaScript truthiness rules
			return success(Boolean(value));
		},
		types: undefined as unknown as { input: unknown; output: boolean },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a schema that coerces values to booleans.
 * Useful for parsing checkboxes or boolean flags from strings.
 */
export function coerceBoolean(): CoerceBooleanSchema {
	return new CoerceBooleanSchema();
}
