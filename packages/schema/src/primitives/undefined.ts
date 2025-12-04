import type { Schema } from '../base';
import { createIssue, failure, success, createParseMethods } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

const parseMethods = createParseMethods<undefined>();

/**
 * Schema for validating undefined values.
 */
export class UndefinedSchema implements Schema<undefined, undefined> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value !== undefined) {
				return failure([createIssue(`Expected undefined, got ${typeof value}`)]);
			}
			return success(value);
		},
		types: undefined as unknown as { input: undefined; output: undefined },
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
 * Create an undefined schema.
 */
export function undefined_(): UndefinedSchema {
	return new UndefinedSchema();
}
