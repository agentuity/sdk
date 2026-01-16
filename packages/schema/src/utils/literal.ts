import type { Schema } from '../base';
import { createIssue, failure, success, createParseMethods, SCHEMA_KIND } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

/**
 * Schema for validating exact literal values.
 *
 * @template T - The exact value type
 *
 * @example
 * ```typescript
 * const adminSchema = s.literal('admin');
 * adminSchema.parse('admin'); // 'admin'
 * adminSchema.parse('user'); // throws ValidationError
 * ```
 */
export class LiteralSchema<T extends string | number | boolean> implements Schema<T, T> {
	readonly [SCHEMA_KIND] = 'LiteralSchema';
	description?: string;
	private parseMethods = createParseMethods<T>();

	constructor(private value: T) {}

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (input: unknown) => {
			if (input !== this.value) {
				return failure([
					createIssue(
						`Expected literal value ${JSON.stringify(this.value)}, got ${JSON.stringify(input)}`
					),
				]);
			}
			return success(this.value);
		},
		types: undefined as unknown as { input: T; output: T },
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

	parse = this.parseMethods.parse;
	safeParse = this.parseMethods.safeParse;
}

/**
 * Create a schema for an exact literal value.
 *
 * @param value - The exact value to match
 *
 * @example
 * ```typescript
 * const adminRole = s.literal('admin');
 * const maxValue = s.literal(100);
 * const enabled = s.literal(true);
 * ```
 */
export function literal<T extends string | number | boolean>(value: T): LiteralSchema<T> {
	return new LiteralSchema(value);
}
