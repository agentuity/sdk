/* eslint-disable @typescript-eslint/no-explicit-any */
import { StructuredError, type InferOutput, type StandardSchemaV1 } from '@agentuity/core';
import type { Context, MiddlewareHandler } from 'hono';
import type { Handler } from 'hono/types';
import { validator as honoValidator } from 'hono/validator';
import { validateSchema, formatValidationIssues } from './_validation';

/**
 * Route validator for standard HTTP routes (non-agent routes).
 * Provides input and output validation with full type safety.
 *
 * **Input validation behavior by HTTP method:**
 * - **GET**: Validates query parameters (accessible via `c.req.valid('query')`)
 * - **POST/PUT/PATCH/DELETE**: Validates JSON body (accessible via `c.req.valid('json')`)
 *
 * **Output validation:**
 * - Validates response JSON body before sending
 * - Throws 500 Internal Server Error if validation fails
 *
 * @template TInput - Input schema type (query params for GET, body for POST/PUT/PATCH/DELETE)
 * @template TOutput - Output schema type for response validation
 *
 * @example GET route with output validation only
 * ```typescript
 * router.get('/users',
 *   validator({ output: z.array(UserSchema) }),
 *   async (c) => {
 *     return c.json([{ id: '1', name: 'Alice' }]);
 *   }
 * );
 * ```
 *
 * @example GET route with query param validation
 * ```typescript
 * router.get('/users/:id',
 *   validator({
 *     input: z.object({ id: z.string() }),
 *     output: UserSchema
 *   }),
 *   async (c) => {
 *     const { id } = c.req.valid('query'); // Fully typed!
 *     return c.json({ id, name: 'Alice' });
 *   }
 * );
 * ```
 *
 * @example POST route with body and output validation
 * ```typescript
 * router.post('/users',
 *   validator({
 *     input: z.object({ name: z.string(), email: z.string().email() }),
 *     output: UserSchema
 *   }),
 *   async (c) => {
 *     const data = c.req.valid('json'); // Fully typed!
 *     return c.json({ id: '1', ...data });
 *   }
 * );
 * ```
 */
export interface RouteValidator {
	/**
	 * Output-only validation (no input validation).
	 * Useful for GET routes without query parameters.
	 *
	 * @template TOutput - Output schema type
	 * @param options - Configuration object with output schema
	 * @returns Hono middleware handler
	 */
	<TOutput extends StandardSchemaV1>(options: {
		output: TOutput;
		stream?: boolean;
	}): Handler<
		any,
		any,
		{
			// eslint-disable-next-line @typescript-eslint/no-empty-object-type
			in: {};
			out: { json: InferOutput<TOutput> };
		}
	>;

	/**
	 * Input and output validation.
	 * - GET: validates query parameters
	 * - POST/PUT/PATCH/DELETE: validates JSON body
	 *
	 * @template TInput - Input schema type
	 * @template TOutput - Optional output schema type
	 * @param options - Configuration object with input and optional output schemas
	 * @returns Hono middleware handler with type inference
	 */
	<
		TInput extends StandardSchemaV1,
		TOutput extends StandardSchemaV1 | undefined = undefined,
	>(options: {
		input: TInput;
		output?: TOutput;
		stream?: boolean;
	}): Handler<
		any,
		any,
		{
			// eslint-disable-next-line @typescript-eslint/no-empty-object-type
			in: {};
			out: {
				json: InferOutput<TInput>;
				query: InferOutput<TInput>;
			};
		}
	>;
}

/**
 * Create a route validator middleware with input and/or output validation.
 *
 * Automatically handles different validation targets based on HTTP method:
 * - GET requests: validates query parameters (if input schema provided)
 * - POST/PUT/PATCH/DELETE: validates JSON body (if input schema provided)
 * - All methods: validates JSON response (if output schema provided)
 *
 * @param options - Validation configuration
 * @param options.input - Input schema (query params for GET, body for POST/PUT/PATCH/DELETE)
 * @param options.output - Output schema for response validation
 * @returns Hono middleware handler
 *
 * @example GET with query validation
 * ```typescript
 * import { validator } from '@agentuity/runtime';
 *
 * router.get('/search',
 *   validator({
 *     input: z.object({ q: z.string(), limit: z.number().optional() }),
 *     output: z.array(SearchResultSchema)
 *   }),
 *   async (c) => {
 *     const { q, limit } = c.req.valid('query'); // Typed!
 *     const results = await search(q, limit);
 *     return c.json(results);
 *   }
 * );
 * ```
 *
 * @example POST with body validation
 * ```typescript
 * router.post('/users',
 *   validator({
 *     input: z.object({ name: z.string() }),
 *     output: UserSchema
 *   }),
 *   async (c) => {
 *     const data = c.req.valid('json'); // Typed!
 *     const user = await createUser(data);
 *     return c.json(user);
 *   }
 * );
 * ```
 */
export const validator: RouteValidator = ((options: {
	input?: StandardSchemaV1;
	output?: StandardSchemaV1;
	stream?: boolean;
}) => {
	const { input: inputSchema, output: outputSchema, stream } = options;

	// Helper to build input validator that detects HTTP method
	const buildInputValidator = (schema: StandardSchemaV1): MiddlewareHandler => {
		return async (c: Context, next) => {
			const method = c.req.method.toUpperCase();

			// GET requests validate query parameters
			if (method === 'GET') {
				const queryValidator = honoValidator('query', async (value, c) => {
					const result = await validateSchema(schema, value);
					if (!result.success) {
						return c.json(
							{
								error: 'Validation failed',
								message: formatValidationIssues(result.issues),
								issues: result.issues,
							},
							400
						);
					}
					return result.data;
				});
				return await queryValidator(c, next);
			}

			// POST/PUT/PATCH/DELETE validate JSON body
			const jsonValidator = honoValidator('json', async (value, c) => {
				const result = await validateSchema(schema, value);
				if (!result.success) {
					return c.json(
						{
							error: 'Validation failed',
							message: formatValidationIssues(result.issues),
							issues: result.issues,
						},
						400
					);
				}
				return result.data;
			});
			return await jsonValidator(c, next);
		};
	};

	// Output validation middleware (runs after handler)
	const outputValidator: MiddlewareHandler = async (c, next) => {
		await next();

		if (!outputSchema) return;

		// Skip output validation for streaming routes
		if (stream) return;

		const res = c.res;
		if (!res) return;

		// Only validate JSON responses
		const contentType = res.headers.get('Content-Type') ?? '';
		if (!contentType.toLowerCase().includes('application/json')) {
			return;
		}

		// Clone so we don't consume the body that will be sent
		let responseBody: unknown;
		try {
			const cloned = res.clone();
			responseBody = await cloned.json();
		} catch {
			const OutputValidationError = StructuredError('OutputValidationError')<{
				issues: any[];
			}>();
			throw new OutputValidationError({
				message: 'Output validation failed: response is not valid JSON',
				issues: [],
			});
		}

		const result = await validateSchema(outputSchema, responseBody);
		if (!result.success) {
			const OutputValidationError = StructuredError('OutputValidationError')<{
				issues: any[];
			}>();
			throw new OutputValidationError({
				message: `Output validation failed: ${formatValidationIssues(result.issues)}`,
				issues: result.issues,
			});
		}

		// Replace response with validated/sanitized JSON
		c.res = new Response(JSON.stringify(result.data), {
			status: res.status,
			headers: res.headers,
		});
	};

	// If no input schema, only do output validation
	if (!inputSchema) {
		return outputValidator as unknown as Handler;
	}

	// If no output schema, only do input validation
	if (!outputSchema) {
		return buildInputValidator(inputSchema) as unknown as Handler;
	}

	// Compose: input validator → output validator
	const inputMiddleware = buildInputValidator(inputSchema);

	const composed: MiddlewareHandler = async (c, next) => {
		// Run input validator first, then output validator, then handler
		const result = await inputMiddleware(c, async () => {
			await outputValidator(c, next);
		});
		// If inputMiddleware returned early (validation failed), return that response
		return result;
	};

	return composed as unknown as Handler;
}) as RouteValidator;
