import type { Schema } from '../base.js';
import { createIssue, failure, success, createParseMethods } from '../base.js';

const parseMethods = createParseMethods<number>();

/**
 * Schema for validating number values.
 * Rejects NaN values.
 *
 * @example
 * ```typescript
 * const schema = s.number();
 * const age = schema.parse(30); // 30
 * schema.parse('30'); // throws ValidationError
 * schema.parse(NaN); // throws ValidationError
 * ```
 */
export class NumberSchema implements Schema<number, number> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (typeof value !== 'number' || Number.isNaN(value)) {
				return failure([createIssue(`Expected number, got ${typeof value}`)]);
			}
			return success(value);
		},
		types: undefined as unknown as { input: number; output: number },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a number schema.
 *
 * @example
 * ```typescript
 * const ageSchema = s.number().describe('User age');
 * const age = ageSchema.parse(30);
 * ```
 */
export function number(): NumberSchema {
	return new NumberSchema();
}
