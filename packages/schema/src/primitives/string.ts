import type { Schema } from '../base.js';
import { createIssue, failure, success, createParseMethods } from '../base.js';

const parseMethods = createParseMethods<string>();

/**
 * Schema for validating string values.
 *
 * @example
 * ```typescript
 * const schema = s.string();
 * const name = schema.parse('John'); // "John"
 * schema.parse(123); // throws ValidationError
 * ```
 */
export class StringSchema implements Schema<string, string> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (typeof value !== 'string') {
				return failure([createIssue(`Expected string, got ${typeof value}`)]);
			}
			return success(value);
		},
		types: undefined as unknown as { input: string; output: string },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a string schema.
 *
 * @example
 * ```typescript
 * const nameSchema = s.string().describe('User name');
 * const name = nameSchema.parse('John');
 * ```
 */
export function string(): StringSchema {
	return new StringSchema();
}
