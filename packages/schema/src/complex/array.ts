import type { Schema, Infer } from '../base';
import { createIssue, failure, success, createParseMethods } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

/**
 * Schema for validating arrays with typed elements.
 * Validates each element and collects all validation errors with array indices in paths.
 *
 * @template T - The schema type for array elements
 *
 * @example
 * ```typescript
 * const tagsSchema = s.array(s.string());
 * const tags = tagsSchema.parse(['tag1', 'tag2']);
 *
 * const usersSchema = s.array(s.object({
 *   name: s.string(),
 *   age: s.number()
 * }));
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ArraySchema<T extends Schema<any, any>>
	implements Schema<Array<Infer<T>>, Array<Infer<T>>>
{
	description?: string;
	private parseMethods = createParseMethods<Array<Infer<T>>>();

	constructor(private itemSchema: T) {}

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value === null) {
				return failure([createIssue('Expected array, got null')]);
			}
			if (!Array.isArray(value)) {
				return failure([createIssue(`Expected array, got ${typeof value}`)]);
			}

			const result: Infer<T>[] = [];
			const issues: ReturnType<typeof createIssue>[] = [];

			for (let i = 0; i < value.length; i++) {
				const validation = this.itemSchema['~standard'].validate(value[i]);

				// Only support synchronous validation for now
				if (validation instanceof Promise) {
					throw new Error('Async validation not supported');
				}

				if (validation.issues) {
					for (const issue of validation.issues) {
						issues.push(createIssue(issue.message, issue.path ? [i, ...issue.path] : [i]));
					}
				} else {
					result.push(validation.value);
				}
			}

			if (issues.length > 0) {
				return failure(issues);
			}

			return success(result);
		},
		types: undefined as unknown as { input: Array<Infer<T>>; output: Array<Infer<T>> },
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
 * Create an array schema with typed elements.
 *
 * @param itemSchema - The schema for validating each array element
 *
 * @example
 * ```typescript
 * const stringArray = s.array(s.string());
 * const tags = stringArray.parse(['tag1', 'tag2']);
 *
 * const userArray = s.array(s.object({
 *   name: s.string(),
 *   age: s.number()
 * }));
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function array<T extends Schema<any, any>>(itemSchema: T): ArraySchema<T> {
	return new ArraySchema(itemSchema);
}
