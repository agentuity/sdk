import type { Schema } from '../base.js';
import { createIssue, failure, success, createParseMethods } from '../base.js';

const parseMethods = createParseMethods<Date>();

/**
 * Schema that coerces values to Date objects using new Date(value).
 * Fails if the result is an invalid date.
 *
 * @example
 * ```typescript
 * const schema = s.coerce.date();
 * schema.parse('2025-01-01'); // Date object
 * schema.parse(1609459200000); // Date from timestamp
 * schema.parse('invalid'); // throws ValidationError
 * ```
 */
export class CoerceDateSchema implements Schema<unknown, Date> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			// Already a Date
			if (value instanceof Date) {
				if (isNaN(value.getTime())) {
					return failure([createIssue('Invalid date')]);
				}
				return success(value);
			}

			// Coerce to Date
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coerced = new Date(value as any);
			if (isNaN(coerced.getTime())) {
				return failure([createIssue(`Cannot coerce ${typeof value} to date`)]);
			}
			return success(coerced);
		},
		types: undefined as unknown as { input: unknown; output: Date },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a schema that coerces values to Date objects.
 * Useful for parsing ISO date strings or timestamps.
 */
export function coerceDate(): CoerceDateSchema {
	return new CoerceDateSchema();
}
