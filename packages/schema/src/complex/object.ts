import type { Schema, Infer } from '../base';
import { createIssue, failure, success, createParseMethods, SCHEMA_KIND } from '../base';
import { optional, OptionalSchema } from '../utils/optional';
import { nullable } from '../utils/nullable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ObjectShape = Record<string, Schema<any, any>>;

// Helper to check if a schema is optional
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsOptional<T> = T extends OptionalSchema<any> ? true : false;

// Split required and optional keys
type RequiredKeys<T extends ObjectShape> = {
	[K in keyof T]: IsOptional<T[K]> extends true ? never : K;
}[keyof T];

type OptionalKeys<T extends ObjectShape> = {
	[K in keyof T]: IsOptional<T[K]> extends true ? K : never;
}[keyof T];

// Infer object shape with proper optional handling
type InferObjectShape<T extends ObjectShape> = {
	[K in RequiredKeys<T>]: Infer<T[K]>;
} & {
	[K in OptionalKeys<T>]?: Infer<T[K]>;
};

// Helper type to make all properties optional schemas
type PartialShape<T extends ObjectShape> = {
	[K in keyof T]: OptionalSchema<T[K]>;
};

// Helper type for picking keys from an object shape
type PickShape<T extends ObjectShape, K extends keyof T> = Pick<T, K>;

// Helper type for omitting keys from an object shape
type OmitShape<T extends ObjectShape, K extends keyof T> = Omit<T, K>;

// Helper type for extending an object shape
type ExtendShape<T extends ObjectShape, U extends ObjectShape> = Omit<T, keyof U> & U;

/**
 * Schema for validating objects with typed properties.
 * Validates each property according to its schema and collects all validation errors.
 *
 * @template T - The object shape definition
 *
 * @example
 * ```typescript
 * const userSchema = s.object({
 *   name: s.string(),
 *   age: s.number(),
 *   email: s.string()
 * });
 *
 * const user = userSchema.parse({
 *   name: 'John',
 *   age: 30,
 *   email: 'john@example.com'
 * });
 * ```
 */
export class ObjectSchema<T extends ObjectShape>
	implements Schema<InferObjectShape<T>, InferObjectShape<T>>
{
	readonly [SCHEMA_KIND] = 'ObjectSchema';
	description?: string;
	private parseMethods = createParseMethods<InferObjectShape<T>>();

	constructor(private shape: T) {}

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (value === null) {
				return failure([createIssue('Expected object, got null')]);
			}
			if (Array.isArray(value)) {
				return failure([createIssue('Expected object, got array')]);
			}
			if (typeof value !== 'object') {
				return failure([createIssue(`Expected object, got ${typeof value}`)]);
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result: Record<string, any> = {};
			const issues: ReturnType<typeof createIssue>[] = [];

			for (const [key, schema] of Object.entries(this.shape)) {
				const fieldValue = (value as Record<string, unknown>)[key];
				const validation = schema['~standard'].validate(fieldValue);

				// Only support synchronous validation for now
				if (validation instanceof Promise) {
					throw new Error('Async validation not supported');
				}

				if (validation.issues) {
					for (const issue of validation.issues) {
						issues.push(
							createIssue(issue.message, issue.path ? [key, ...issue.path] : [key])
						);
					}
				} else {
					result[key] = validation.value;
				}
			}

			if (issues.length > 0) {
				return failure(issues);
			}

			return success(result as InferObjectShape<T>);
		},
		types: undefined as unknown as { input: InferObjectShape<T>; output: InferObjectShape<T> },
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

	/**
	 * Create a new object schema with only the specified keys.
	 * Similar to TypeScript's Pick<T, K> utility type.
	 *
	 * @param keys - Array of keys to pick from the schema
	 *
	 * @example
	 * ```typescript
	 * const userSchema = s.object({ name: s.string(), age: s.number(), email: s.string() });
	 * const nameOnlySchema = userSchema.pick(['name']);
	 * // { name: string }
	 * ```
	 */
	pick<K extends keyof T & string>(keys: readonly K[]): ObjectSchema<PickShape<T, K>> {
		const newShape = {} as PickShape<T, K>;
		for (const key of keys) {
			if (key in this.shape) {
				newShape[key] = this.shape[key];
			}
		}
		return new ObjectSchema(newShape);
	}

	/**
	 * Create a new object schema without the specified keys.
	 * Similar to TypeScript's Omit<T, K> utility type.
	 *
	 * @param keys - Array of keys to omit from the schema
	 *
	 * @example
	 * ```typescript
	 * const userSchema = s.object({ name: s.string(), age: s.number(), password: s.string() });
	 * const publicUserSchema = userSchema.omit(['password']);
	 * // { name: string; age: number }
	 * ```
	 */
	omit<K extends keyof T & string>(keys: readonly K[]): ObjectSchema<OmitShape<T, K>> {
		const keysSet = new Set(keys);
		const newShape = {} as OmitShape<T, K>;
		for (const [key, schema] of Object.entries(this.shape)) {
			if (!keysSet.has(key as K)) {
				(newShape as ObjectShape)[key] = schema;
			}
		}
		return new ObjectSchema(newShape);
	}

	/**
	 * Create a new object schema where all properties are optional.
	 * Similar to TypeScript's Partial<T> utility type.
	 *
	 * @example
	 * ```typescript
	 * const userSchema = s.object({ name: s.string(), age: s.number() });
	 * const partialUserSchema = userSchema.partial();
	 * // { name?: string; age?: number }
	 * ```
	 */
	partial(): ObjectSchema<PartialShape<T>> {
		const newShape = {} as PartialShape<T>;
		for (const [key, schema] of Object.entries(this.shape)) {
			(newShape as ObjectShape)[key] = optional(schema);
		}
		return new ObjectSchema(newShape);
	}

	/**
	 * Create a new object schema by extending this schema with additional properties.
	 * Properties in the extension override properties in the base schema.
	 * Similar to TypeScript's intersection types with override semantics.
	 *
	 * @param extension - Object shape to extend with
	 *
	 * @example
	 * ```typescript
	 * const userSchema = s.object({ name: s.string(), age: s.number() });
	 * const adminSchema = userSchema.extend({ role: s.literal('admin'), permissions: s.array(s.string()) });
	 * // { name: string; age: number; role: 'admin'; permissions: string[] }
	 * ```
	 */
	extend<U extends ObjectShape>(extension: U): ObjectSchema<ExtendShape<T, U>> {
		const newShape = { ...this.shape, ...extension } as ExtendShape<T, U>;
		return new ObjectSchema(newShape);
	}

	parse = this.parseMethods.parse;
	safeParse = this.parseMethods.safeParse;
}

/**
 * Create an object schema with typed properties.
 *
 * @param shape - Object defining the schema for each property
 *
 * @example
 * ```typescript
 * const userSchema = s.object({
 *   name: s.string().describe('Full name'),
 *   age: s.number().describe('Age in years'),
 *   email: s.optional(s.string())
 * });
 *
 * type User = s.infer<typeof userSchema>;
 * const user = userSchema.parse(data);
 * ```
 */
export function object<T extends ObjectShape>(shape: T): ObjectSchema<T> {
	return new ObjectSchema(shape);
}
