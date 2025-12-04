import type { Schema } from '../base';
import { createIssue, failure, success, createParseMethods } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

const parseMethods = createParseMethods<number>();

/**
 * Schema that coerces values to numbers using Number(value).
 * Fails if the result is NaN.
 *
 * @example
 * ```typescript
 * const schema = s.coerce.number();
 * schema.parse('123'); // 123
 * schema.parse(true); // 1
 * schema.parse('abc'); // throws ValidationError
 * ```
 */
export class CoerceNumberSchema implements Schema<unknown, number> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			// Already a number
			if (typeof value === 'number') {
				if (Number.isNaN(value)) {
					return failure([createIssue('Cannot coerce NaN to number')]);
				}
				return success(value);
			}

			// Coerce to number
			const coerced = Number(value);
			if (Number.isNaN(coerced)) {
				return failure([createIssue(`Cannot coerce ${typeof value} to number`)]);
			}
			return success(coerced);
		},
		types: undefined as unknown as { input: unknown; output: number },
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
 * Create a schema that coerces values to numbers.
 * Useful for parsing form data or query parameters where numbers come as strings.
 */
export function coerceNumber(): CoerceNumberSchema {
	return new CoerceNumberSchema();
}
