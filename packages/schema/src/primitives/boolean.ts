import type { Schema } from '../base';
import { createIssue, failure, success, createParseMethods } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

const parseMethods = createParseMethods<boolean>();

/**
 * Schema for validating boolean values.
 *
 * @example
 * ```typescript
 * const schema = s.boolean();
 * const active = schema.parse(true); // true
 * schema.parse('true'); // throws ValidationError
 * ```
 */
export class BooleanSchema implements Schema<boolean, boolean> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (typeof value !== 'boolean') {
				return failure([createIssue(`Expected boolean, got ${typeof value}`)]);
			}
			return success(value);
		},
		types: undefined as unknown as { input: boolean; output: boolean },
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
 * Create a boolean schema.
 *
 * @example
 * ```typescript
 * const activeSchema = s.boolean().describe('Account status');
 * const active = activeSchema.parse(true);
 * ```
 */
export function boolean(): BooleanSchema {
	return new BooleanSchema();
}
