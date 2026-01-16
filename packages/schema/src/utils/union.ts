import type { Schema, Infer } from '../base';
import { createIssue, failure, createParseMethods, SCHEMA_KIND } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferUnion<T extends Schema<any, any>[]> = Infer<T[number]>;

/**
 * Schema for union types (one of multiple possible schemas).
 * Validates against each schema until one succeeds.
 *
 * @template T - Array of schema types
 *
 * @example
 * ```typescript
 * const idSchema = s.union(s.string(), s.number());
 * idSchema.parse('abc123'); // 'abc123'
 * idSchema.parse(123); // 123
 *
 * const roleSchema = s.union(
 *   s.literal('admin'),
 *   s.literal('user'),
 *   s.literal('guest')
 * );
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class UnionSchema<T extends Schema<any, any>[]>
	implements Schema<InferUnion<T>, InferUnion<T>>
{
	readonly [SCHEMA_KIND] = 'UnionSchema';
	description?: string;
	private parseMethods = createParseMethods<InferUnion<T>>();

	constructor(private schemas: T) {}

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			const allIssues: ReturnType<typeof createIssue>[] = [];

			for (const schema of this.schemas) {
				const result = schema['~standard'].validate(value);

				// Only support synchronous validation for now
				if (result instanceof Promise) {
					throw new Error('Async validation not supported');
				}

				if (!result.issues) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return result as any;
				}
				allIssues.push(...result.issues);
			}

			return failure([
				createIssue(
					`Value did not match any of the union types (${allIssues.length} validation errors)`
				),
			]);
		},
		types: undefined as unknown as { input: InferUnion<T>; output: InferUnion<T> },
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
 * Create a union schema (one of multiple possible types).
 *
 * @param schemas - Variable number of schemas to union
 *
 * @example
 * ```typescript
 * const idSchema = s.union(s.string(), s.number());
 *
 * const roleSchema = s.union(
 *   s.literal('admin'),
 *   s.literal('user'),
 *   s.literal('guest')
 * );
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function union<T extends Schema<any, any>[]>(...schemas: T): UnionSchema<T> {
	return new UnionSchema(schemas);
}
