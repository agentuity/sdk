/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StandardSchemaV1 } from '@agentuity/core';

/**
 * Schema definition for routes that can have input (POST, PUT, PATCH, DELETE).
 * Both input and output are optional, but output is recommended.
 *
 * @template TInput - Input schema (StandardSchemaV1 or undefined)
 * @template TOutput - Output schema (StandardSchemaV1 or undefined)
 *
 * @example
 * ```typescript
 * const schema: RouteSchema<z.ZodObject<{name: z.ZodString}>, z.ZodString> = {
 *   input: z.object({ name: z.string() }),
 *   output: z.string()
 * };
 * ```
 */
export type RouteSchema<
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = {
	input?: TInput;
	output?: TOutput;
};

/**
 * Schema definition for GET routes.
 * Input is not allowed (enforced as never), only output validation is supported.
 *
 * @template TOutput - Output schema (StandardSchemaV1 or undefined)
 *
 * @example
 * ```typescript
 * const schema: GetRouteSchema<z.ZodString> = {
 *   output: z.string()
 * };
 * ```
 */
export type GetRouteSchema<
	TOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = {
	input?: never;
	output?: TOutput;
};

/**
 * Infer the input type from a StandardSchema.
 * Returns the input type of the schema (before validation/transformation).
 *
 * @template T - Schema type
 */
export type InferSchemaInput<T> = T extends StandardSchemaV1
	? StandardSchemaV1.InferInput<T>
	: undefined;

/**
 * Infer the output type from a StandardSchema.
 * Returns the output type of the schema (after validation/transformation).
 *
 * @template T - Schema type
 */
export type InferSchemaOutput<T> = T extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<T>
	: undefined;

/**
 * Extract input schema from RouteSchema or GetRouteSchema.
 *
 * @template T - RouteSchema or GetRouteSchema type
 */
export type ExtractInputSchema<T> =
	T extends RouteSchema<infer I, any> ? I : T extends GetRouteSchema<any> ? never : never;

/**
 * Extract output schema from RouteSchema or GetRouteSchema.
 *
 * @template T - RouteSchema or GetRouteSchema type
 */
export type ExtractOutputSchema<T> =
	T extends RouteSchema<any, infer O> ? O : T extends GetRouteSchema<infer O> ? O : never;

/**
 * Validation result from StandardSchema validation.
 */
export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; issues: StandardSchemaV1.Issue[] };

/**
 * Validates a value against a StandardSchema.
 *
 * @param schema - The StandardSchema to validate against
 * @param value - The value to validate
 * @returns ValidationResult with success/failure and data/issues
 */
export async function validateSchema<T>(
	schema: StandardSchemaV1,
	value: unknown
): Promise<ValidationResult<T>> {
	const result = await schema['~standard'].validate(value);

	if ('issues' in result && result.issues) {
		return { success: false, issues: Array.from(result.issues) };
	}

	return { success: true, data: result.value as T };
}

/**
 * Format validation issues into a readable error message.
 *
 * @param issues - Array of validation issues
 * @returns Formatted error message
 */
export function formatValidationIssues(issues: StandardSchemaV1.Issue[]): string {
	return issues
		.map((issue) => {
			const path = issue.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.') || '';
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join(', ');
}
