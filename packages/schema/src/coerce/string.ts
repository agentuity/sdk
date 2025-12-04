import type { Schema } from '../base.js';
import { success, createParseMethods } from '../base.js';

const parseMethods = createParseMethods<string>();

/**
 * Schema that coerces any value to a string using String(value).
 *
 * @example
 * ```typescript
 * const schema = s.coerce.string();
 * schema.parse(123); // '123'
 * schema.parse(true); // 'true'
 * schema.parse(null); // 'null'
 * ```
 */
export class CoerceStringSchema implements Schema<unknown, string> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			// Coerce to string
			return success(String(value));
		},
		types: undefined as unknown as { input: unknown; output: string },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a schema that coerces values to strings.
 * Useful for parsing form data or query parameters.
 */
export function coerceString(): CoerceStringSchema {
	return new CoerceStringSchema();
}
