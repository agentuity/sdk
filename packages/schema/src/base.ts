import type { StandardSchemaV1 } from '@agentuity/core';

/**
 * Symbol used to identify schema types in a minification-safe way.
 * Uses Symbol.for() to ensure the same symbol is used across bundled modules.
 */
export const SCHEMA_KIND = Symbol.for('@agentuity/schema-kind');

/**
 * A validation issue from a failed schema validation.
 */
export type ValidationIssue = StandardSchemaV1.Issue;

/**
 * The result of a schema validation (success or failure).
 */
export type ValidationResult<T> = StandardSchemaV1.Result<T>;

/**
 * Successful parse result containing validated data.
 */
export interface SafeParseSuccess<T> {
	/** Indicates successful validation */
	success: true;
	/** The validated and typed data */
	data: T;
}

/**
 * Failed parse result containing validation error.
 */
export interface SafeParseError {
	/** Indicates failed validation */
	success: false;
	/** The validation error with detailed issues */
	error: ValidationError;
}

/**
 * Result of safeParse - either success with data or failure with error.
 */
export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseError;

/**
 * Error thrown when schema validation fails.
 * Contains detailed information about all validation issues including field paths.
 *
 * @example
 * ```typescript
 * try {
 *   schema.parse(data);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.log(error.message);  // Human-readable error
 *     console.log(error.issues);   // Detailed issues array
 *   }
 * }
 * ```
 */
export class ValidationError extends Error {
	/** Array of validation issues with paths and messages */
	readonly issues: readonly ValidationIssue[];

	constructor(issues: readonly ValidationIssue[]) {
		const message = issues
			.map((issue) => {
				const path = issue.path
					? `[${issue.path
							.map((p) =>
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								typeof p === 'object' ? (p as any).key : p
							)
							.join('.')}]`
					: '';
				return path ? `${path}: ${issue.message}` : issue.message;
			})
			.join('\n');

		super(message);
		this.name = 'ValidationError';
		this.issues = issues;

		// Maintain proper stack trace for where our error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ValidationError);
		}
	}

	toString(): string {
		return `${this.name}: ${this.message}`;
	}
}

/**
 * Base schema interface that all schemas implement.
 * Provides StandardSchema v1 compliance plus additional methods for parsing and description.
 */
export interface Schema<Input = unknown, Output = Input> extends StandardSchemaV1<Input, Output> {
	readonly '~standard': StandardSchemaV1.Props<Input, Output>;
	/** Optional description for documentation */
	description?: string;
	/** Add a description to the schema for documentation and JSON Schema */
	describe(description: string): this;
	/** Parse and validate data, throwing ValidationError on failure */
	parse(value: unknown): Output;
	/** Parse and validate data, returning result object without throwing */
	safeParse(value: unknown): SafeParseResult<Output>;
	/** Make this schema optional (allow undefined) */
	optional(): Schema<Input | undefined, Output | undefined>;
	/** Make this schema nullable (allow null) */
	nullable(): Schema<Input | null, Output | null>;
}

/**
 * Extract the output type from a schema (like zod's z.infer).
 *
 * @example
 * ```typescript
 * const User = s.object({ name: s.string(), age: s.number() });
 * type User = Infer<typeof User>;  // { name: string; age: number }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Infer<T extends Schema<any, any>> = StandardSchemaV1.InferOutput<T>;

/**
 * Extract the input type from a schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferInput<T extends Schema<any, any>> = StandardSchemaV1.InferInput<T>;

/**
 * Extract the output type from a schema (alias for Infer).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferOutput<T extends Schema<any, any>> = StandardSchemaV1.InferOutput<T>;

/**
 * Create a validation issue with an optional field path.
 */
export function createIssue(
	message: string,
	path?: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment>
): ValidationIssue {
	return path ? { message, path } : { message };
}

/**
 * Create a successful validation result.
 */
export function success<T>(value: T): StandardSchemaV1.SuccessResult<T> {
	return { value };
}

/**
 * Create a failed validation result.
 */
export function failure(issues: ValidationIssue[]): StandardSchemaV1.FailureResult {
	return { issues };
}

/**
 * Create parse and safeParse methods for a schema.
 * @internal
 */
export function createParseMethods<Output>() {
	return {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		parse(this: Schema<any, Output>, value: unknown): Output {
			const result = this['~standard'].validate(value);
			if (result instanceof Promise) {
				throw new Error('Async validation not supported in parse()');
			}
			if (result.issues) {
				throw new ValidationError(result.issues);
			}
			return result.value;
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		safeParse(this: Schema<any, Output>, value: unknown): SafeParseResult<Output> {
			const result = this['~standard'].validate(value);
			if (result instanceof Promise) {
				throw new Error('Async validation not supported in safeParse()');
			}
			if (result.issues) {
				return { success: false, error: new ValidationError(result.issues) };
			}
			return { success: true, data: result.value };
		},
	};
}
