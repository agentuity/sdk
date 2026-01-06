import type { Schema, Infer } from '../base';
import { createIssue, failure, success, createParseMethods, SCHEMA_KIND } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

/**
 * Schema for validating records (objects with string keys and typed values).
 * Like TypeScript's Record<string, T> type.
 *
 * @template K - The key schema (must be string)
 * @template V - The value schema
 *
 * @example
 * ```typescript
 * const schema = s.record(s.string(), s.number());
 * schema.parse({ a: 1, b: 2 }); // { a: 1, b: 2 }
 * schema.parse({ a: 'invalid' }); // throws ValidationError
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RecordSchema<K extends Schema<string, string>, V extends Schema<any, any>>
	implements Schema<Record<Infer<K>, Infer<V>>, Record<Infer<K>, Infer<V>>>
{
	readonly [SCHEMA_KIND] = 'RecordSchema';
	description?: string;
	private recordParseMethods = createParseMethods<Record<Infer<K>, Infer<V>>>();

	constructor(
		private keySchema: K,
		private valueSchema: V
	) {}

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value === null) {
				return failure([createIssue('Expected record, got null')]);
			}
			if (Array.isArray(value)) {
				return failure([createIssue('Expected record, got array')]);
			}
			if (typeof value !== 'object') {
				return failure([createIssue(`Expected record, got ${typeof value}`)]);
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result: Record<string, any> = {};
			const issues: ReturnType<typeof createIssue>[] = [];

			for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
				// Validate key
				const keyValidation = this.keySchema['~standard'].validate(key);
				if (keyValidation instanceof Promise) {
					throw new Error('Async validation not supported');
				}
				if (keyValidation.issues) {
					for (const issue of keyValidation.issues) {
						issues.push(createIssue(`Invalid key "${key}": ${issue.message}`, [key]));
					}
					continue;
				}

				// Validate value
				const valueValidation = this.valueSchema['~standard'].validate(val);
				if (valueValidation instanceof Promise) {
					throw new Error('Async validation not supported');
				}
				if (valueValidation.issues) {
					for (const issue of valueValidation.issues) {
						issues.push(
							createIssue(issue.message, issue.path ? [key, ...issue.path] : [key])
						);
					}
				} else {
					result[key] = valueValidation.value;
				}
			}

			if (issues.length > 0) {
				return failure(issues);
			}

			return success(result as Record<Infer<K>, Infer<V>>);
		},
		types: undefined as unknown as {
			input: Record<Infer<K>, Infer<V>>;
			output: Record<Infer<K>, Infer<V>>;
		},
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

	parse = this.recordParseMethods.parse;
	safeParse = this.recordParseMethods.safeParse;
}

/**
 * Create a record schema for objects with string keys and typed values.
 *
 * @param keySchema - Schema for keys (typically s.string())
 * @param valueSchema - Schema for values
 *
 * @example
 * ```typescript
 * const configSchema = s.record(s.string(), s.number());
 * const config = configSchema.parse({ timeout: 30, retries: 3 });
 *
 * const metadataSchema = s.record(s.string(), s.unknown());
 * const metadata = metadataSchema.parse({ any: 'data', here: 123 });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function record<K extends Schema<string, string>, V extends Schema<any, any>>(
	keySchema: K,
	valueSchema: V
): RecordSchema<K, V> {
	return new RecordSchema(keySchema, valueSchema);
}
