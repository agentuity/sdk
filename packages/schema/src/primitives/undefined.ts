import type { Schema } from '../base.ts';
import { createIssue, failure, success, createParseMethods, SCHEMA_KIND } from '../base.ts';
import { optional } from '../utils/optional.ts';
import { nullable } from '../utils/nullable.ts';

const parseMethods = createParseMethods<undefined>();

/**
 * Schema for validating undefined values.
 */
export class UndefinedSchema implements Schema<undefined, undefined> {
	readonly [SCHEMA_KIND] = 'UndefinedSchema';
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
