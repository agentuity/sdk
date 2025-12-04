import type { Schema } from '../base.js';
import { createIssue, failure, success, createParseMethods } from '../base.js';

const parseMethods = createParseMethods<null>();

/**
 * Schema for validating null values.
 */
export class NullSchema implements Schema<null, null> {
	description?: string;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value !== null) {
				return failure([createIssue(`Expected null, got ${typeof value}`)]);
			}
			return success(value);
		},
		types: undefined as unknown as { input: null; output: null },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a null schema.
 */
export function null_(): NullSchema {
	return new NullSchema();
}
