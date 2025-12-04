/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	StructuredError,
	type KeyValueStorage,
	type ObjectStorage,
	type StandardSchemaV1,
	type StreamStorage,
	type VectorStorage,
	toCamelCase,
} from '@agentuity/core';
import { context, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import type { Context, MiddlewareHandler } from 'hono';
import type { Handler } from 'hono/types';
import { validator } from 'hono/validator';
import { getAgentContext, runInAgentContext, type RequestAgentContextArgs } from './_context';
import type { Logger } from './logger';
import type {
	Eval,
	EvalContext,
	EvalRunResult,
	EvalMetadata,
	EvalFunction,
	ExternalEvalMetadata,
} from './eval';
import { internal } from './logger/internal';
import { getApp } from './app';
import type { Thread, Session } from './session';
import { privateContext, notifyReady } from './_server';
import { generateId } from './session';
import { getEvalRunEventProvider } from './_services';
import * as runtimeConfig from './_config';
import type { EvalRunStartEvent } from '@agentuity/core';
import type { AppState } from './index';
import { validateSchema, formatValidationIssues } from './_validation';

export type AgentEventName = 'started' | 'completed' | 'errored';

export type AgentEventCallback<TAgent extends Agent<any, any, any>> =
	| ((
			eventName: 'started',
			agent: TAgent,
			context: AgentContext<any, any, any>
	  ) => Promise<void> | void)
	| ((
			eventName: 'completed',
			agent: TAgent,
			context: AgentContext<any, any, any>
	  ) => Promise<void> | void)
	| ((
			eventName: 'errored',
			agent: TAgent,
			context: AgentContext<any, any, any>,
			data: Error
	  ) => Promise<void> | void);

/**
 * Context object passed to every agent handler providing access to runtime services and state.
 *
 * @template TAgentRegistry - Registry of all available agents (auto-generated, strongly-typed)
 * @template TCurrent - Current agent runner type
 * @template TParent - Parent agent runner type (if called from another agent)
 * @template TConfig - Agent-specific configuration type from setup function
 * @template TAppState - Application-wide state type from createApp
 *
 * @example
 * ```typescript
 * const agent = createAgent({
 *   handler: async (ctx, input) => {
 *     // Logging
 *     ctx.logger.info('Processing request', { input });
 *
 *     // Call another agent
 *     const result = await ctx.agent.otherAgent.run({ data: input });
 *
 *     // Store data
 *     await ctx.kv.set('key', { value: result });
 *
 *     // Access config from setup
 *     const cache = ctx.config.cache;
 *
 *     // Background task
 *     ctx.waitUntil(async () => {
 *       await ctx.logger.info('Cleanup complete');
 *     });
 *
 *     return result;
 *   }
 * });
 * ```
 */
export interface AgentContext<
	TAgentRegistry extends AgentRegistry = AgentRegistry,
	TCurrent extends AgentRunner<any, any, any> | undefined = AgentRunner<any, any, any> | undefined,
	TParent extends AgentRunner<any, any, any> | undefined = AgentRunner<any, any, any> | undefined,
	TConfig = unknown,
	TAppState = Record<string, never>,
> {
	/**
	 * Schedule a background task that continues after the response is sent.
	 * Useful for cleanup, logging, or async operations that don't block the response.
	 *
	 * @param promise - Promise or function that returns void or Promise<void>
	 *
	 * @example
	 * ```typescript
	 * ctx.waitUntil(async () => {
	 *   await ctx.kv.set('processed', Date.now());
	 *   ctx.logger.info('Background task complete');
	 * });
	 * ```
	 */
	waitUntil: (promise: Promise<void> | (() => void | Promise<void>)) => void;

	/**
	 * Registry of all agents in the application. Strongly-typed and auto-generated.
	 * Use to call other agents from within your handler.
	 *
	 * @example
	 * ```typescript
	 * const emailResult = await ctx.agent.email.run({ to: 'user@example.com' });
	 * const smsResult = await ctx.agent.sms.run({ phone: '+1234567890' });
	 * ```
	 */
	agent: TAgentRegistry;

	/**
	 * Information about the currently executing agent.
	 */
	current: TCurrent;

	/**
	 * Information about the parent agent (if this agent was called by another agent).
	 * Use ctx.agent.parentName for strongly-typed access.
	 */
	parent: TParent;

	/**
	 * Name of the current agent being executed.
	 */
	agentName: AgentName;

	/**
	 * Structured logger with OpenTelemetry integration.
	 * Logs are automatically correlated with traces.
	 *
	 * @example
	 * ```typescript
	 * ctx.logger.info('Processing started', { userId: input.id });
	 * ctx.logger.warn('Rate limit approaching', { remaining: 10 });
	 * ctx.logger.error('Operation failed', { error: err.message });
	 * ```
	 */
	logger: Logger;

	/**
	 * Unique session identifier for this request. Consistent across agent calls in the same session.
	 */
	sessionId: string;

	/**
	 * OpenTelemetry tracer for creating custom spans and tracking performance.
	 *
	 * @example
	 * ```typescript
	 * const span = ctx.tracer.startSpan('database-query');
	 * try {
	 *   const result = await database.query();
	 *   span.setStatus({ code: SpanStatusCode.OK });
	 *   return result;
	 * } finally {
	 *   span.end();
	 * }
	 * ```
	 */
	tracer: Tracer;

	/**
	 * Key-value storage for simple data persistence.
	 *
	 * @example
	 * ```typescript
	 * await ctx.kv.set('user:123', { name: 'Alice', age: 30 });
	 * const user = await ctx.kv.get('user:123');
	 * await ctx.kv.delete('user:123');
	 * const keys = await ctx.kv.list('user:*');
	 * ```
	 */
	kv: KeyValueStorage;

	/**
	 * Object storage for files and blobs (S3-compatible).
	 *
	 * @example
	 * ```typescript
	 * await ctx.objectstore.put('images/photo.jpg', buffer);
	 * const file = await ctx.objectstore.get('images/photo.jpg');
	 * await ctx.objectstore.delete('images/photo.jpg');
	 * const objects = await ctx.objectstore.list('images/');
	 * ```
	 */
	objectstore: ObjectStorage;

	/**
	 * Stream storage for real-time data streams and logs.
	 *
	 * @example
	 * ```typescript
	 * const stream = await ctx.stream.create('agent-logs');
	 * await ctx.stream.write(stream.id, 'Processing step 1');
	 * await ctx.stream.write(stream.id, 'Processing step 2');
	 * ```
	 */
	stream: StreamStorage;

	/**
	 * Vector storage for embeddings and similarity search.
	 *
	 * @example
	 * ```typescript
	 * await ctx.vector.upsert('docs', [
	 *   { id: '1', values: [0.1, 0.2, 0.3], metadata: { text: 'Hello' } }
	 * ]);
	 * const results = await ctx.vector.query('docs', [0.1, 0.2, 0.3], { topK: 5 });
	 * ```
	 */
	vector: VectorStorage;

	/**
	 * In-memory state storage scoped to the current request.
	 * Use for passing data between middleware and handlers.
	 *
	 * @example
	 * ```typescript
	 * ctx.state.set('startTime', Date.now());
	 * const duration = Date.now() - (ctx.state.get('startTime') as number);
	 * ```
	 */
	state: Map<string, unknown>;

	/**
	 * Thread information for multi-turn conversations.
	 */
	thread: Thread;

	/**
	 * Session information for the current request.
	 */
	session: Session;

	/**
	 * Agent-specific configuration returned from the setup function.
	 * Type is inferred from your setup function's return value.
	 *
	 * @example
	 * ```typescript
	 * createAgent({
	 *   setup: async () => ({ cache: new Map(), db: await connectDB() }),
	 *   handler: async (ctx, input) => {
	 *     ctx.config.cache.set('key', 'value'); // Strongly typed!
	 *     await ctx.config.db.query('SELECT * FROM users');
	 *   }
	 * });
	 * ```
	 */
	config: TConfig;

	/**
	 * Application-wide state returned from createApp setup function.
	 * Shared across all agents in the application.
	 *
	 * @example
	 * ```typescript
	 * const app = createApp({
	 *   setup: async () => ({ db: await connectDB(), redis: await connectRedis() })
	 * });
	 *
	 * // Later in any agent:
	 * handler: async (ctx, input) => {
	 *   await ctx.app.db.query('SELECT 1');
	 *   await ctx.app.redis.set('key', 'value');
	 * }
	 * ```
	 */
	app: TAppState;
}

type InternalAgentMetadata = {
	/**
	 * the unique identifier for this project, agent and deployment.
	 */
	id: string;
	/**
	 * the unique identifier for this project and agent across multiple deployments.
	 */
	identifier: string;
	/**
	 * the unique identifier for this agent across multiple deployments
	 */
	agentId: string;
	/**
	 * the relative path to the agent from the root project directory.
	 */
	filename: string;
	/**
	 * a unique version for the agent. computed as the SHA256 contents of the file.
	 */
	version: string;

	/**
	 * the source code for the input schema.
	 */
	inputSchemaCode?: string;

	/**
	 * the source code for the output schema.
	 */
	outputSchemaCode?: string;
};

type ExternalAgentMetadata = {
	/**
	 * the human readable name for the agent.
	 */
	name: string;
	/**
	 * the human readable description for the agent
	 */
	description?: string;
};

type AgentMetadata = InternalAgentMetadata & ExternalAgentMetadata;

/**
 * Configuration object for creating an agent evaluation function.
 *
 * @template TInput - Input schema type from the parent agent
 * @template TOutput - Output schema type from the parent agent
 */
export interface CreateEvalConfig<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> {
	/**
	 * Optional metadata for the evaluation function.
	 *
	 * @example
	 * ```typescript
	 * metadata: {
	 *   name: 'Validate positive output',
	 *   description: 'Ensures output is greater than zero'
	 * }
	 * ```
	 */
	metadata?: Partial<ExternalEvalMetadata>;

	/**
	 * Evaluation handler function that tests the agent's behavior.
	 * Return true if the evaluation passes, false if it fails.
	 *
	 * @param run - Evaluation run context containing input and metadata
	 * @param result - The output from the agent handler
	 * @returns Boolean indicating pass/fail, or evaluation result object
	 *
	 * @example
	 * ```typescript
	 * handler: async (run, result) => {
	 *   // Assert that output is positive
	 *   if (result <= 0) {
	 *     return false; // Evaluation failed
	 *   }
	 *   return true; // Evaluation passed
	 * }
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // With detailed result
	 * handler: async (run, result) => {
	 *   const passed = result.length > 5;
	 *   return {
	 *     passed,
	 *     score: passed ? 1.0 : 0.0,
	 *     message: passed ? 'Output length is valid' : 'Output too short'
	 *   };
	 * }
	 * ```
	 */
	handler: EvalFunction<
		TInput extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TInput> : undefined,
		TOutput extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TOutput> : undefined
	>;
}

// Type for createEval method
type CreateEvalMethod<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> = (config: CreateEvalConfig<TInput, TOutput>) => Eval<TInput, TOutput>;

/**
 * Validator function type with method overloads for different validation scenarios.
 * Provides type-safe validation middleware that integrates with Hono's type system.
 *
 * This validator automatically validates incoming JSON request bodies using StandardSchema-compatible
 * schemas (Zod, Valibot, ArkType, etc.) and provides full TypeScript type inference for validated data
 * accessible via `c.req.valid('json')`.
 *
 * The validator returns 400 Bad Request with validation error details if validation fails.
 *
 * @template TInput - Agent's input schema type (StandardSchemaV1 or undefined)
 * @template _TOutput - Agent's output schema type (reserved for future output validation)
 *
 * @example Basic usage with agent's schema
 * ```typescript
 * router.post('/', agent.validator(), async (c) => {
 *   const data = c.req.valid('json'); // Fully typed from agent's input schema
 *   return c.json(data);
 * });
 * ```
 *
 * @example Override with custom input schema
 * ```typescript
 * router.post('/custom', agent.validator({ input: z.object({ id: z.string() }) }), async (c) => {
 *   const data = c.req.valid('json'); // Typed as { id: string }
 *   return c.json(data);
 * });
 * ```
 */
export interface AgentValidator<
	TInput extends StandardSchemaV1 | undefined,
	_TOutput extends StandardSchemaV1 | undefined,
> {
	/**
	 * Validates using the agent's input schema (no override).
	 * Returns Hono middleware handler that validates JSON request body.
	 *
	 * @returns Middleware handler with type inference for validated data
	 *
	 * @example
	 * ```typescript
	 * // Agent has schema: { input: z.object({ name: z.string() }) }
	 * router.post('/', agent.validator(), async (c) => {
	 *   const data = c.req.valid('json'); // { name: string }
	 *   return c.json({ received: data.name });
	 * });
	 * ```
	 */
	(): TInput extends StandardSchemaV1
		? Handler<
				any,
				any,
				{
					// eslint-disable-next-line @typescript-eslint/no-empty-object-type
					in: {};
					out: { json: StandardSchemaV1.InferOutput<TInput> };
				}
			>
		: Handler<any, any, any>;

	/**
	 * Output-only validation override.
	 * Validates only the response body (no input validation).
	 *
	 * Useful for GET routes or routes where input validation is handled elsewhere.
	 * The middleware validates the JSON response body and throws 500 Internal Server Error
	 * if validation fails.
	 *
	 * @template TOverrideOutput - Custom output schema type
	 * @param override - Object containing output schema
	 * @returns Middleware handler that validates response output
	 *
	 * @example GET route with output validation
	 * ```typescript
	 * router.get('/', agent.validator({ output: z.array(z.object({ id: z.string() })) }), async (c) => {
	 *   // Returns array of objects - validated against schema
	 *   return c.json([{ id: '123' }, { id: '456' }]);
	 * });
	 * ```
	 */
	<TOverrideOutput extends StandardSchemaV1>(override: {
		output: TOverrideOutput;
	}): Handler<
		any,
		any,
		{
			// eslint-disable-next-line @typescript-eslint/no-empty-object-type
			in: {};
			out: { json: StandardSchemaV1.InferOutput<TOverrideOutput> };
		}
	>;

	/**
	 * Validates with custom input and optional output schemas (POST/PUT/PATCH/DELETE).
	 * Overrides the agent's schema for this specific route.
	 *
	 * @template TOverrideInput - Custom input schema type
	 * @template TOverrideOutput - Optional custom output schema type
	 * @param override - Object containing input (required) and output (optional) schemas
	 * @returns Middleware handler with type inference from custom schemas
	 *
	 * @example Custom input schema
	 * ```typescript
	 * router.post('/users', agent.validator({
	 *   input: z.object({ email: z.string().email(), name: z.string() })
	 * }), async (c) => {
	 *   const data = c.req.valid('json'); // { email: string, name: string }
	 *   return c.json({ id: '123', ...data });
	 * });
	 * ```
	 *
	 * @example Custom input and output schemas
	 * ```typescript
	 * router.post('/convert', agent.validator({
	 *   input: z.string(),
	 *   output: z.number()
	 * }), async (c) => {
	 *   const data = c.req.valid('json'); // string
	 *   return c.json(123);
	 * });
	 * ```
	 */
	<
		TOverrideInput extends StandardSchemaV1,
		TOverrideOutput extends StandardSchemaV1 | undefined = undefined,
	>(override: {
		input: TOverrideInput;
		output?: TOverrideOutput;
	}): Handler<
		any,
		any,
		{
			// eslint-disable-next-line @typescript-eslint/no-empty-object-type
			in: {};
			out: {
				json: StandardSchemaV1.InferOutput<TOverrideInput>;
			};
		}
	>;
}

/**
 * Agent instance type returned by createAgent().
 * Represents a fully configured agent with metadata, handler, lifecycle hooks, and event listeners.
 *
 * @template TInput - Input schema type (StandardSchemaV1 or undefined)
 * @template TOutput - Output schema type (StandardSchemaV1 or undefined)
 * @template TStream - Whether the agent returns a stream (true/false)
 * @template TConfig - Agent-specific configuration type from setup function
 * @template TAppState - Application state type from createApp
 *
 * @example
 * ```typescript
 * const agent = createAgent({
 *   metadata: { name: 'My Agent' },
 *   schema: { input: z.string(), output: z.number() },
 *   handler: async (ctx, input) => input.length
 * });
 *
 * // Access agent properties
 * console.log(agent.metadata.name); // "My Agent"
 *
 * // Add event listeners
 * agent.addEventListener('started', (eventName, agent, ctx) => {
 *   console.log('Agent started:', ctx.sessionId);
 * });
 *
 * // Create evals for testing
 * const eval1 = agent.createEval({
 *   handler: async (run, result) => {
 *     return result > 5; // Assert output is greater than 5
 *   }
 * });
 * ```
 */
export type Agent<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
	TConfig = unknown,
	TAppState = Record<string, never>,
> = {
	/**
	 * Agent metadata including name, description, id, version, and filename.
	 */
	metadata: AgentMetadata;

	/**
	 * The main handler function that processes agent requests.
	 * Receives AgentContext and validated input, returns output or stream.
	 */
	handler: (
		ctx: AgentContext<any, any, any, TConfig, TAppState>,
		...args: any[]
	) => any | Promise<any>;

	/**
	 * Creates a type-safe validation middleware for routes using StandardSchema validation.
	 *
	 * This method validates incoming JSON request bodies against the agent's **input schema**
	 * and optionally validates outgoing JSON responses against the **output schema**.
	 * Provides full TypeScript type inference for validated input data accessible via `c.req.valid('json')`.
	 *
	 * **Validation behavior:**
	 * - **Input**: Validates request JSON body, returns 400 Bad Request on failure
	 * - **Output**: Validates response JSON body (if output schema provided), throws 500 on failure
	 * - Passes validated input data to handler via `c.req.valid('json')`
	 * - Full TypeScript type inference for validated input data
	 *
	 * **Supported schema libraries:**
	 * - Zod (z.object, z.string, etc.)
	 * - Valibot (v.object, v.string, etc.)
	 * - ArkType (type({ ... }))
	 * - Any StandardSchema-compatible library
	 *
	 * **Method overloads:**
	 * - `agent.validator()` - Validates using agent's input/output schemas
	 * - `agent.validator({ output: schema })` - Output-only validation (no input validation)
	 * - `agent.validator({ input: schema })` - Custom input schema override
	 * - `agent.validator({ input: schema, output: schema })` - Both input and output validated
	 *
	 * @returns Hono middleware handler with proper type inference
	 *
	 * @example Automatic validation using agent's schema
	 * ```typescript
	 * // Agent defined with: schema: { input: z.object({ name: z.string(), age: z.number() }) }
	 * router.post('/', agent.validator(), async (c) => {
	 *   const data = c.req.valid('json'); // Fully typed: { name: string, age: number }
	 *   return c.json({ greeting: `Hello ${data.name}, age ${data.age}` });
	 * });
	 * ```
	 *
	 * @example Override with custom schema per-route
	 * ```typescript
	 * router.post('/email', agent.validator({
	 *   input: z.object({ email: z.string().email() })
	 * }), async (c) => {
	 *   const data = c.req.valid('json'); // Typed as { email: string }
	 *   return c.json({ sent: data.email });
	 * });
	 * ```
	 *
	 * @example Works with any StandardSchema library
	 * ```typescript
	 * import * as v from 'valibot';
	 *
	 * router.post('/valibot', agent.validator({
	 *   input: v.object({ count: v.number() })
	 * }), async (c) => {
	 *   const data = c.req.valid('json'); // Typed correctly
	 *   return c.json({ count: data.count });
	 * });
	 * ```
	 *
	 * @example Validation error response (400)
	 * ```typescript
	 * // Request: { "name": "Bob" } (missing 'age')
	 * // Response: {
	 * //   "error": "Validation failed",
	 * //   "message": "age: Invalid input: expected number, received undefined",
	 * //   "issues": [{ "message": "...", "path": ["age"] }]
	 * // }
	 * ```
	 */
	validator: AgentValidator<TInput, TOutput>;

	/**
	 * Array of evaluation functions created via agent.createEval().
	 * Used for testing and validating agent behavior.
	 */
	evals?: Eval[];

	/**
	 * Create an evaluation function for testing this agent.
	 * Evals can assert correctness of agent input/output during test runs.
	 *
	 * @param config - Eval configuration
	 * @param config.metadata - Optional eval metadata (name, description)
	 * @param config.handler - Eval handler function receiving run context and result
	 *
	 * @example
	 * ```typescript
	 * const agent = createAgent({
	 *   schema: { input: z.string(), output: z.number() },
	 *   handler: async (ctx, input) => input.length
	 * });
	 *
	 * // Create eval to validate output
	 * agent.createEval({
	 *   metadata: { name: 'Check positive output' },
	 *   handler: async (run, result) => {
	 *     return result > 0; // Assert output is positive
	 *   }
	 * });
	 * ```
	 */
	createEval: CreateEvalMethod<TInput, TOutput>;

	/**
	 * Optional setup function called once when app starts.
	 * Returns agent-specific configuration available via ctx.config.
	 */
	setup?: (app: TAppState) => Promise<TConfig> | TConfig;

	/**
	 * Optional shutdown function called when app stops.
	 * Receives app state and agent config for cleanup.
	 */
	shutdown?: (app: TAppState, config: TConfig) => Promise<void> | void;

	/**
	 * Register an event listener for when the agent starts execution.
	 *
	 * @param eventName - Must be 'started'
	 * @param callback - Function called when agent execution begins
	 *
	 * @example
	 * ```typescript
	 * agent.addEventListener('started', (eventName, agent, ctx) => {
	 *   console.log(`${agent.metadata.name} started at ${new Date()}`);
	 * });
	 * ```
	 */
	addEventListener(
		eventName: 'started',
		callback: (
			eventName: 'started',
			agent: Agent<TInput, TOutput, TStream, TConfig, TAppState>,
			context: AgentContext<any, any, any, TConfig, TAppState>
		) => Promise<void> | void
	): void;

	/**
	 * Register an event listener for when the agent completes successfully.
	 *
	 * @param eventName - Must be 'completed'
	 * @param callback - Function called when agent execution completes
	 *
	 * @example
	 * ```typescript
	 * agent.addEventListener('completed', (eventName, agent, ctx) => {
	 *   console.log(`${agent.metadata.name} completed successfully`);
	 * });
	 * ```
	 */
	addEventListener(
		eventName: 'completed',
		callback: (
			eventName: 'completed',
			agent: Agent<TInput, TOutput, TStream, TConfig, TAppState>,
			context: AgentContext<any, any, any, TConfig, TAppState>
		) => Promise<void> | void
	): void;

	/**
	 * Register an event listener for when the agent throws an error.
	 *
	 * @param eventName - Must be 'errored'
	 * @param callback - Function called when agent execution fails
	 *
	 * @example
	 * ```typescript
	 * agent.addEventListener('errored', (eventName, agent, ctx, error) => {
	 *   console.error(`${agent.metadata.name} failed:`, error.message);
	 * });
	 * ```
	 */
	addEventListener(
		eventName: 'errored',
		callback: (
			eventName: 'errored',
			agent: Agent<TInput, TOutput, TStream, TConfig, TAppState>,
			context: AgentContext<any, any, any, TConfig, TAppState>,
			data: Error
		) => Promise<void> | void
	): void;

	/**
	 * Remove a previously registered 'started' event listener.
	 *
	 * @param eventName - Must be 'started'
	 * @param callback - The callback function to remove
	 */
	removeEventListener(
		eventName: 'started',
		callback: (
			eventName: 'started',
			agent: Agent<TInput, TOutput, TStream, TConfig, TAppState>,
			context: AgentContext<any, any, any, TConfig, TAppState>
		) => Promise<void> | void
	): void;

	/**
	 * Remove a previously registered 'completed' event listener.
	 *
	 * @param eventName - Must be 'completed'
	 * @param callback - The callback function to remove
	 */
	removeEventListener(
		eventName: 'completed',
		callback: (
			eventName: 'completed',
			agent: Agent<TInput, TOutput, TStream, TConfig, TAppState>,
			context: AgentContext<any, any, any, TConfig, TAppState>
		) => Promise<void> | void
	): void;

	/**
	 * Remove a previously registered 'errored' event listener.
	 *
	 * @param eventName - Must be 'errored'
	 * @param callback - The callback function to remove
	 */
	removeEventListener(
		eventName: 'errored',
		callback: (
			eventName: 'errored',
			agent: Agent<TInput, TOutput, TStream, TConfig, TAppState>,
			context: AgentContext<any, any, any, TConfig, TAppState>,
			data: Error
		) => Promise<void> | void
	): void;
} & (TInput extends StandardSchemaV1 ? { inputSchema: TInput } : { inputSchema?: never }) &
	(TOutput extends StandardSchemaV1 ? { outputSchema: TOutput } : { outputSchema?: never }) &
	(TStream extends true ? { stream: true } : { stream?: false });

type InferSchemaInput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> : never;

type InferStreamOutput<TOutput, TStream extends boolean> = TStream extends true
	? TOutput extends StandardSchemaV1
		? ReadableStream<StandardSchemaV1.InferOutput<TOutput>>
		: ReadableStream<unknown>
	: TOutput extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<TOutput>
		: void;

type SchemaInput<TSchema> = TSchema extends { input: infer I } ? I : undefined;
type SchemaOutput<TSchema> = TSchema extends { output: infer O } ? O : undefined;
type SchemaStream<TSchema> = TSchema extends { stream: infer S }
	? S extends boolean
		? S
		: false
	: false;

type SchemaHandlerReturn<TSchema> =
	SchemaStream<TSchema> extends true
		? SchemaOutput<TSchema> extends StandardSchemaV1
			? ReadableStream<StandardSchemaV1.InferOutput<SchemaOutput<TSchema>>>
			: ReadableStream<unknown>
		: SchemaOutput<TSchema> extends StandardSchemaV1
			? StandardSchemaV1.InferOutput<SchemaOutput<TSchema>>
			: void;

// Handler signature based on schema + setup result (no self-reference)
type AgentHandlerFromConfig<TSchema, TSetupReturn, TAppState = AppState> =
	SchemaInput<TSchema> extends infer I
		? I extends StandardSchemaV1
			? (
					ctx: AgentContext<any, any, any, TSetupReturn, TAppState>,
					input: StandardSchemaV1.InferOutput<I>
				) => Promise<SchemaHandlerReturn<TSchema>> | SchemaHandlerReturn<TSchema>
			: (
					ctx: AgentContext<any, any, any, TSetupReturn, TAppState>
				) => Promise<SchemaHandlerReturn<TSchema>> | SchemaHandlerReturn<TSchema>
		: (
				ctx: AgentContext<any, any, any, TSetupReturn, TAppState>
			) => Promise<SchemaHandlerReturn<TSchema>> | SchemaHandlerReturn<TSchema>;

/**
 * Configuration object for creating an agent with automatic type inference.
 *
 * @template TSchema - Schema definition object containing optional input, output, and stream properties
 * @template TConfig - Function type that returns agent-specific configuration from setup
 */
export interface CreateAgentConfig<
	TSchema extends
		| {
				input?: StandardSchemaV1;
				output?: StandardSchemaV1;
				stream?: boolean;
		  }
		| undefined = undefined,
	TConfig extends (app: AppState) => any = any,
> {
	/**
	 * Optional schema validation using Zod or any StandardSchemaV1 compatible library.
	 *
	 * @example
	 * ```typescript
	 * schema: {
	 *   input: z.object({ name: z.string(), age: z.number() }),
	 *   output: z.string(),
	 *   stream: false
	 * }
	 * ```
	 */
	schema?: TSchema;

	/**
	 * Agent metadata visible in the Agentuity platform.
	 *
	 * @example
	 * ```typescript
	 * metadata: {
	 *   name: 'Greeting Agent',
	 *   description: 'Returns personalized greetings'
	 * }
	 * ```
	 */
	metadata: ExternalAgentMetadata;

	/**
	 * Optional async function called once on app startup to initialize agent-specific resources.
	 * The returned value is available in the handler via `ctx.config`.
	 *
	 * @param app - Application state from createApp setup function
	 * @returns Agent-specific configuration object
	 *
	 * @example
	 * ```typescript
	 * setup: async (app) => {
	 *   const cache = new Map();
	 *   const db = await connectDB();
	 *   return { cache, db };
	 * }
	 * ```
	 */
	setup?: TConfig;

	/**
	 * The main agent logic that processes requests.
	 * Receives AgentContext and validated input (if schema.input is defined), returns output or stream.
	 *
	 * @param ctx - Agent context with logger, storage, and other runtime services
	 * @param input - Validated input (only present if schema.input is defined)
	 * @returns Output matching schema.output type, or ReadableStream if schema.stream is true
	 *
	 * @example
	 * ```typescript
	 * handler: async (ctx, { name, age }) => {
	 *   ctx.logger.info(`Processing for ${name}`);
	 *   await ctx.kv.set('lastUser', name);
	 *   return `Hello, ${name}! You are ${age} years old.`;
	 * }
	 * ```
	 */
	handler: AgentHandlerFromConfig<
		TSchema,
		TConfig extends (app: AppState) => infer R ? Awaited<R> : undefined,
		AppState
	>;

	/**
	 * Optional async cleanup function called on app shutdown.
	 * Use this to close connections, flush buffers, etc.
	 *
	 * @param app - Application state from createApp
	 * @param config - Agent config returned from setup function
	 *
	 * @example
	 * ```typescript
	 * shutdown: async (app, config) => {
	 *   await config.db.close();
	 *   config.cache.clear();
	 * }
	 * ```
	 */
	shutdown?: (
		app: AppState,
		config: TConfig extends (app: AppState) => infer R ? Awaited<R> : undefined
	) => Promise<void> | void;
}

export interface AgentRunner<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
> {
	metadata: AgentMetadata;
	run: undefined extends TInput
		? () => Promise<InferStreamOutput<Exclude<TOutput, undefined>, TStream>>
		: (
				input: InferSchemaInput<Exclude<TInput, undefined>>
			) => Promise<InferStreamOutput<Exclude<TOutput, undefined>, TStream>>;
}

// Will be populated at runtime with strongly typed agents
const agents = new Map<string, Agent<any, any, any, any, any>>();

// WeakMap to store event listeners for each agent instance (truly private)
const agentEventListeners = new WeakMap<
	Agent<any, any, any, any, any>,
	Map<AgentEventName, Set<AgentEventCallback<any>>>
>();

// Map to store agent configs returned from setup (keyed by agent name)
const agentConfigs = new Map<string, unknown>();

// Helper to fire event listeners sequentially, abort on first error
async function fireAgentEvent(
	agent: Agent<any, any, any, any, any>,
	eventName: 'started' | 'completed',
	context: AgentContext<any, any, any, any, any>
): Promise<void>;
async function fireAgentEvent(
	agent: Agent<any, any, any, any, any>,
	eventName: 'errored',
	context: AgentContext<any, any, any, any, any>,
	data: Error
): Promise<void>;
async function fireAgentEvent(
	agent: Agent<any, any, any, any, any>,
	eventName: AgentEventName,
	context: AgentContext<any, any, any, any, any>,
	data?: Error
): Promise<void> {
	// Fire agent-level listeners
	const listeners = agentEventListeners.get(agent);
	if (listeners) {
		const callbacks = listeners.get(eventName);
		if (callbacks && callbacks.size > 0) {
			for (const callback of callbacks) {
				if (eventName === 'errored' && data) {
					await (callback as any)(eventName, agent, context, data);
				} else if (eventName === 'started' || eventName === 'completed') {
					await (callback as any)(eventName, agent, context);
				}
			}
		}
	}

	// Fire app-level listeners
	const app = getApp();
	if (app) {
		if (eventName === 'errored' && data) {
			await app.fireEvent('agent.errored', agent, context, data);
		} else if (eventName === 'started') {
			await app.fireEvent('agent.started', agent, context);
		} else if (eventName === 'completed') {
			await app.fireEvent('agent.completed', agent, context);
		}
	}
}

/**
 * Union type of all registered agent names.
 * Falls back to `string` when no agents are registered (before augmentation).
 * After augmentation, this becomes a strict union of agent names for full type safety.
 */
export type AgentName = keyof AgentRegistry extends never ? string : keyof AgentRegistry;

/**
 * Agent registry interface.
 * This interface is augmented by generated code to provide strongly-typed agent access.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AgentRegistry {}

export const registerAgent = (name: AgentName, agent: Agent<any, any, any, any, any>): void => {
	agents.set(name, agent);
};

export const setAgentConfig = (name: AgentName, config: unknown): void => {
	agentConfigs.set(name, config);
};

export const getAgentConfig = (name: AgentName): unknown => {
	return agentConfigs.get(name);
};

const ValidationError = StructuredError('ValidationError')<{
	issues: readonly StandardSchemaV1.Issue[];
}>();

/**
 * Configuration object for creating an agent with explicit type parameters.
 *
 * @template TInput - Input schema type (StandardSchemaV1 or undefined)
 * @template TOutput - Output schema type (StandardSchemaV1 or undefined)
 * @template TStream - Whether agent returns a stream (true/false)
 * @template TConfig - Type returned by setup function
 * @template TAppState - Custom app state type from createApp
 */
export interface CreateAgentConfigExplicit<
	TInput extends StandardSchemaV1 | undefined = undefined,
	TOutput extends StandardSchemaV1 | undefined = undefined,
	TStream extends boolean = false,
	TConfig = unknown,
	TAppState = AppState,
> {
	/**
	 * Optional schema validation.
	 *
	 * @example
	 * ```typescript
	 * schema: {
	 *   input: z.object({ name: z.string() }),
	 *   output: z.string(),
	 *   stream: false
	 * }
	 * ```
	 */
	schema?: {
		/** Input validation schema */
		input?: TInput;
		/** Output validation schema */
		output?: TOutput;
		/** Whether the agent returns a ReadableStream */
		stream?: TStream;
	};

	/**
	 * Agent metadata.
	 *
	 * @example
	 * ```typescript
	 * metadata: {
	 *   name: 'My Agent',
	 *   description: 'Does something useful'
	 * }
	 * ```
	 */
	metadata: ExternalAgentMetadata;

	/**
	 * Optional setup function receiving app state, returns agent config.
	 * The returned value is available in the handler via `ctx.config`.
	 *
	 * @param app - Application state from createApp
	 * @returns Agent-specific configuration
	 *
	 * @example
	 * ```typescript
	 * setup: async (app) => ({ cache: new Map() })
	 * ```
	 */
	setup?: (app: TAppState) => Promise<TConfig> | TConfig;

	/**
	 * Optional cleanup function called on app shutdown.
	 *
	 * @param app - Application state from createApp
	 * @param config - Agent config returned from setup
	 *
	 * @example
	 * ```typescript
	 * shutdown: async (app, config) => {
	 *   config.cache.clear();
	 * }
	 * ```
	 */
	shutdown?: (app: TAppState, config: TConfig) => Promise<void> | void;

	/**
	 * Agent handler function.
	 * Type is automatically inferred based on schema definitions.
	 *
	 * @param ctx - Agent context
	 * @param input - Validated input (only present if schema.input is defined)
	 * @returns Output or ReadableStream based on schema
	 *
	 * @example
	 * ```typescript
	 * handler: async (ctx, input) => {
	 *   return `Hello, ${input.name}!`;
	 * }
	 * ```
	 */
	handler: TInput extends StandardSchemaV1
		? TStream extends true
			? TOutput extends StandardSchemaV1
				? (
						c: AgentContext<any, any, any, TConfig, TAppState>,
						input: StandardSchemaV1.InferOutput<TInput>
					) =>
						| Promise<ReadableStream<StandardSchemaV1.InferOutput<TOutput>>>
						| ReadableStream<StandardSchemaV1.InferOutput<TOutput>>
				: (
						c: AgentContext<any, any, any, TConfig, TAppState>,
						input: StandardSchemaV1.InferOutput<TInput>
					) => Promise<ReadableStream<unknown>> | ReadableStream<unknown>
			: TOutput extends StandardSchemaV1
				? (
						c: AgentContext<any, any, any, TConfig, TAppState>,
						input: StandardSchemaV1.InferOutput<TInput>
					) =>
						| Promise<StandardSchemaV1.InferOutput<TOutput>>
						| StandardSchemaV1.InferOutput<TOutput>
				: (
						c: AgentContext<any, any, any, TConfig, TAppState>,
						input: StandardSchemaV1.InferOutput<TInput>
					) => Promise<void> | void
		: TStream extends true
			? TOutput extends StandardSchemaV1
				? (
						c: AgentContext<any, any, any, TConfig, TAppState>
					) =>
						| Promise<ReadableStream<StandardSchemaV1.InferOutput<TOutput>>>
						| ReadableStream<StandardSchemaV1.InferOutput<TOutput>>
				: (
						c: AgentContext<any, any, any, TConfig, TAppState>
					) => Promise<ReadableStream<unknown>> | ReadableStream<unknown>
			: TOutput extends StandardSchemaV1
				? (
						c: AgentContext<any, any, any, TConfig, TAppState>
					) =>
						| Promise<StandardSchemaV1.InferOutput<TOutput>>
						| StandardSchemaV1.InferOutput<TOutput>
				: (c: AgentContext<any, any, any, TConfig, TAppState>) => Promise<void> | void;
}

/**
 * Creates an agent with schema validation and lifecycle hooks.
 *
 * This is the recommended way to create agents with automatic type inference from schemas.
 *
 * @template TSchema - Schema definition object containing optional input, output, and stream properties
 * @template TConfig - Function type that returns agent-specific configuration from setup
 *
 * @param config - Agent configuration object
 *
 * @returns Agent instance that can be registered with the runtime
 *
 * @example
 * ```typescript
 * const agent = createAgent({
 *   metadata: {
 *     name: 'Greeting Agent',
 *     description: 'Returns personalized greetings'
 *   },
 *   schema: {
 *     input: z.object({ name: z.string(), age: z.number() }),
 *     output: z.string()
 *   },
 *   handler: async (ctx, { name, age }) => {
 *     ctx.logger.info(`Processing greeting for ${name}`);
 *     return `Hello, ${name}! You are ${age} years old.`;
 *   }
 * });
 * ```
 */
export function createAgent<
	TSchema extends
		| {
				input?: StandardSchemaV1;
				output?: StandardSchemaV1;
				stream?: boolean;
		  }
		| undefined = undefined,
	TConfig extends (app: AppState) => any = any,
>(
	config: CreateAgentConfig<TSchema, TConfig>
): Agent<
	SchemaInput<TSchema>,
	SchemaOutput<TSchema>,
	SchemaStream<TSchema>,
	TConfig extends (app: AppState) => infer R ? Awaited<R> : undefined,
	AppState
>;

/**
 * Creates an agent with explicit generic type parameters.
 *
 * Use this overload when you need explicit control over types or working with custom app state.
 *
 * @template TInput - Input schema type (StandardSchemaV1 or undefined)
 * @template TOutput - Output schema type (StandardSchemaV1 or undefined)
 * @template TStream - Whether agent returns a stream (true/false)
 * @template TConfig - Type returned by setup function
 * @template TAppState - Custom app state type from createApp
 *
 * @param config - Agent configuration object
 *
 * @returns Agent instance with explicit types
 *
 * @example
 * ```typescript
 * interface MyAppState { db: Database }
 * interface MyConfig { cache: Map<string, any> }
 *
 * const agent = createAgent<
 *   z.ZodObject<any>, // TInput
 *   z.ZodString,      // TOutput
 *   false,            // TStream
 *   MyConfig,         // TConfig
 *   MyAppState        // TAppState
 * >({
 *   metadata: { name: 'Custom Agent' },
 *   setup: async (app) => ({ cache: new Map() }),
 *   handler: async (ctx, input) => {
 *     const db = ctx.app.db;
 *     const cache = ctx.config.cache;
 *     return 'result';
 *   }
 * });
 * ```
 */
export function createAgent<
	TInput extends StandardSchemaV1 | undefined = undefined,
	TOutput extends StandardSchemaV1 | undefined = undefined,
	TStream extends boolean = false,
	TConfig = unknown,
	TAppState = AppState,
>(
	config: CreateAgentConfigExplicit<TInput, TOutput, TStream, TConfig, TAppState>
): Agent<TInput, TOutput, TStream, TConfig, TAppState>;

// Implementation
export function createAgent<
	TInput extends StandardSchemaV1 | undefined = undefined,
	TOutput extends StandardSchemaV1 | undefined = undefined,
	TStream extends boolean = false,
	TConfig = unknown,
	TAppState = AppState,
>(
	config: CreateAgentConfigExplicit<TInput, TOutput, TStream, TConfig, TAppState>
): Agent<TInput, TOutput, TStream, TConfig, TAppState> {
	const inputSchema = config.schema?.input;
	const outputSchema = config.schema?.output;

	// Initialize evals array before handler so it can be captured in closure
	// Evals should only be added via agent.createEval() after agent creation
	const evalsArray: Eval[] = [];

	const handler = async (_ctx: Context, input?: any) => {
		let validatedInput: any = undefined;

		if (inputSchema) {
			const inputResult = await inputSchema['~standard'].validate(input);
			if (inputResult.issues) {
				throw new ValidationError({
					issues: inputResult.issues,
					message: `Input validation failed: ${inputResult.issues.map((i: any) => i.message).join(', ')}`,
				});
			}
			validatedInput = inputResult.value;
		}

		const agentCtx = getAgentContext() as AgentContext<any, any, any, TConfig, TAppState>;

		// Get the agent instance from the agents Map to fire events
		// The agent will be registered in the agents Map before the handler is called
		const agentName = agentCtx.agentName;
		const registeredAgent = agentName ? agents.get(agentName) : undefined;

		// Fire 'started' event (only if agent is registered)
		if (registeredAgent) {
			await fireAgentEvent(registeredAgent, 'started', agentCtx);
		}

		try {
			const result = inputSchema
				? await (config.handler as any)(agentCtx, validatedInput)
				: await (config.handler as any)(agentCtx);

			let validatedOutput: any = result;
			if (outputSchema) {
				const outputResult = await outputSchema['~standard'].validate(result);
				if (outputResult.issues) {
					throw new ValidationError({
						issues: outputResult.issues,
						message: `Output validation failed: ${outputResult.issues.map((i: any) => i.message).join(', ')}`,
					});
				}
				validatedOutput = outputResult.value;
			}

			// Store validated input/output in context state for event listeners
			agentCtx.state.set('_evalInput', validatedInput);
			agentCtx.state.set('_evalOutput', validatedOutput);

			// Fire 'completed' event - evals will run via event listener
			if (registeredAgent) {
				await fireAgentEvent(registeredAgent, 'completed', agentCtx);
			}

			return validatedOutput;
		} catch (error) {
			// Fire 'errored' event
			if (registeredAgent) {
				await fireAgentEvent(registeredAgent, 'errored', agentCtx, error as Error);
			}
			throw error;
		}
	};

	// Infer input/output types from agent schema
	type AgentInput = TInput extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<TInput>
		: undefined;
	type AgentOutput = TOutput extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<TOutput>
		: undefined;

	// Create createEval method that infers types from agent and automatically adds to agent
	const createEval = (evalConfig: {
		metadata?: Partial<EvalMetadata>;
		handler: EvalFunction<AgentInput, AgentOutput>;
	}): Eval<TInput, TOutput> => {
		const evalName = evalConfig.metadata?.name || 'unnamed';
		// Trace log to verify evals file is imported
		internal.debug(
			`createEval called for agent "${config?.metadata?.name || 'unknown'}": registering eval "${evalName}"`
		);

		// Get filename (can be provided via __filename or set by bundler)
		const filename = evalConfig.metadata?.filename || '';

		// Use name as identifier for consistency (same as agents)
		const identifier = evalName;

		// Use build-time injected id/version if available, otherwise generate at runtime
		// Build-time injection happens via bundler AST transformation
		let evalId = evalConfig.metadata?.id;
		let stableEvalId = evalConfig.metadata?.evalId;
		let version = evalConfig.metadata?.version;

		// Generate version from available metadata if not provided (deterministic hash)
		// At build-time, version is hash of file contents; at runtime we use metadata
		if (!version) {
			const versionHasher = new Bun.CryptoHasher('sha1');
			versionHasher.update(identifier);
			versionHasher.update(evalName);
			versionHasher.update(filename);
			version = versionHasher.digest('hex');
		}

		// Generate eval ID using same logic as build-time (getEvalId) if not provided
		// Format: eval_${hashSHA1(projectId, deploymentId, filename, name, version)}
		if (!evalId) {
			const projectId = runtimeConfig.getProjectId() || '';
			const deploymentId = runtimeConfig.getDeploymentId() || '';
			const idHasher = new Bun.CryptoHasher('sha1');
			idHasher.update(projectId);
			idHasher.update(deploymentId);
			idHasher.update(filename);
			idHasher.update(evalName);
			idHasher.update(version);
			evalId = `eval_${idHasher.digest('hex')}`;
		}

		// Generate stable evalId if not provided (for project-wide identification)
		if (!stableEvalId) {
			const projectId = runtimeConfig.getProjectId() || '';
			const stableHasher = new Bun.CryptoHasher('sha1');
			stableHasher.update(projectId);
			stableHasher.update(evalName);
			stableEvalId = `evalid_${stableHasher.digest('hex')}`.substring(0, 64);
		}

		const evalType: any = {
			metadata: {
				id: evalId,
				evalId: stableEvalId,
				version,
				identifier,
				name: evalConfig.metadata?.name || '',
				description: evalConfig.metadata?.description || '',
				filename,
			},
			handler: evalConfig.handler,
		};

		if (inputSchema) {
			evalType.inputSchema = inputSchema;
		}

		if (outputSchema) {
			evalType.outputSchema = outputSchema;
		}

		// Automatically add eval to agent's evals array
		evalsArray.push(evalType);
		internal.debug(
			`Added eval "${evalName}" to agent "${config?.metadata?.name || 'unknown'}". Total evals: ${evalsArray.length}`
		);

		return evalType as Eval<TInput, TOutput>;
	};

	const agent: any = {
		handler,
		metadata: config.metadata,
		evals: evalsArray,
		createEval,
		setup: config.setup,
		shutdown: config.shutdown,
	};

	// Add event listener methods
	agent.addEventListener = (eventName: AgentEventName, callback: any): void => {
		const agentForListeners = agent as any as Agent<any, any, any>;
		const callbackForListeners = callback as any as AgentEventCallback<any>;
		let listeners = agentEventListeners.get(agentForListeners);
		if (!listeners) {
			listeners = new Map();
			agentEventListeners.set(agentForListeners, listeners);
		}
		let callbacks = listeners.get(eventName);
		if (!callbacks) {
			callbacks = new Set();
			listeners.set(eventName, callbacks);
		}
		callbacks.add(callbackForListeners);
	};

	// Automatically add event listener for 'completed' event to run evals
	(agent as Agent).addEventListener('completed', async (_event, _agent, ctx) => {
		// Get the agent instance from the agents Map to access its current evals array
		// This ensures we get evals that were added via agent.createEval() after agent creation
		const agentName = ctx.agentName;
		const registeredAgent = agentName ? agents.get(agentName) : undefined;
		const agentEvals = registeredAgent?.evals || evalsArray;

		internal.debug(
			`Checking evals: agentName=${agentName}, evalsArray.length=${evalsArray?.length || 0}, agent.evals.length=${registeredAgent?.evals?.length || 0}`
		);

		if (agentEvals && agentEvals.length > 0) {
			internal.info(`Executing ${agentEvals.length} eval(s) after agent run`);

			// Get validated input/output from context state
			const validatedInput = ctx.state.get('_evalInput');
			const validatedOutput = ctx.state.get('_evalOutput');

			// Execute each eval using waitUntil to avoid blocking the response
			for (const evalItem of agentEvals) {
				const evalName = evalItem.metadata.name || 'unnamed';

				ctx.waitUntil(
					(async () => {
						internal.info(`[EVALRUN] Starting eval run tracking for '${evalName}'`);
						const evalRunId = generateId('evalrun');
						const evalId = evalItem.metadata.id || '';
						const orgId = runtimeConfig.getOrganizationId();
						const projectId = runtimeConfig.getProjectId();
						const devMode = runtimeConfig.isDevMode() ?? false;
						const evalRunEventProvider = getEvalRunEventProvider();

						// Only send events if we have required context (devmode flag will be set based on devMode)
						const shouldSendEvalRunEvents = orgId && projectId && evalId !== '';

						internal.info(`[EVALRUN] Checking conditions for eval '${evalName}':`, {
							orgId: orgId,
							projectId: projectId,
							evalId: evalId,
							devMode,
							hasEvalRunEventProvider: !!evalRunEventProvider,
							shouldSendEvalRunEvents,
						});

						if (!shouldSendEvalRunEvents) {
							const reasons: string[] = [];
							if (!orgId) reasons.push('missing orgId');
							if (!projectId) reasons.push('missing projectId');
							if (!evalId || evalId === '') reasons.push('empty evalId');
							internal.info(
								`[EVALRUN] Skipping eval run events for '${evalName}': ${reasons.join(', ')}`
							);
						}

						try {
							internal.debug(`Executing eval: ${evalName}`);

							// Send eval run start event
							if (shouldSendEvalRunEvents && evalRunEventProvider) {
								internal.info(
									`[EVALRUN] Sending start event for eval '${evalName}' (id: ${evalRunId}, evalId: ${evalId})`
								);
								try {
									const deploymentId = runtimeConfig.getDeploymentId();
									const startEvent: EvalRunStartEvent = {
										id: evalRunId,
										sessionId: ctx.sessionId,
										evalId: evalId,
										orgId: orgId!,
										projectId: projectId!,
										devmode: Boolean(devMode),
										deploymentId: deploymentId || undefined,
									};
									internal.debug(
										'[EVALRUN] Start event payload: %s',
										JSON.stringify(startEvent, null, 2)
									);
									await evalRunEventProvider.start(startEvent);
									internal.info(
										`[EVALRUN] Start event sent successfully for eval '${evalName}' (id: ${evalRunId})`
									);
								} catch (error) {
									internal.error(
										`[EVALRUN] Error sending eval run start event for '${evalName}' (id: ${evalRunId})`,
										{
											error,
										}
									);
									// Don't throw - continue with eval execution even if start event fails
								}
							} else if (shouldSendEvalRunEvents && !evalRunEventProvider) {
								internal.warn(
									`[EVALRUN] Conditions met but no evalRunEventProvider available for '${evalName}'`
								);
							} else {
								internal.debug(
									`[EVALRUN] Not sending start event for '${evalName}': shouldSendEvalRunEvents=${shouldSendEvalRunEvents}, hasProvider=${!!evalRunEventProvider}`
								);
							}

							// Validate eval input if schema exists
							let evalValidatedInput: any = validatedInput;
							if (evalItem.inputSchema) {
								const evalInputResult =
									await evalItem.inputSchema['~standard'].validate(validatedInput);
								if (evalInputResult.issues) {
									throw new ValidationError({
										issues: evalInputResult.issues,
										message: `Eval input validation failed: ${evalInputResult.issues.map((i: any) => i.message).join(', ')}`,
									});
								}
								evalValidatedInput = evalInputResult.value;
							}

							// Validate eval output if schema exists
							let evalValidatedOutput: any = validatedOutput;
							if (evalItem.outputSchema) {
								const evalOutputResult =
									await evalItem.outputSchema['~standard'].validate(validatedOutput);
								if (evalOutputResult.issues) {
									throw new ValidationError({
										issues: evalOutputResult.issues,
										message: `Eval output validation failed: ${evalOutputResult.issues.map((i: any) => i.message).join(', ')}`,
									});
								}
								evalValidatedOutput = evalOutputResult.value;
							}

							// Create EvalContext (just an alias for AgentContext)
							const evalContext: EvalContext = ctx;

							// Execute the eval handler conditionally based on agent schema
							let result: EvalRunResult;
							if (inputSchema && outputSchema) {
								// Both input and output defined
								result = await (evalItem.handler as any)(
									evalContext,
									evalValidatedInput,
									evalValidatedOutput
								);
							} else if (inputSchema) {
								// Only input defined
								result = await (evalItem.handler as any)(evalContext, evalValidatedInput);
							} else if (outputSchema) {
								// Only output defined
								result = await (evalItem.handler as any)(evalContext, evalValidatedOutput);
							} else {
								// Neither defined
								result = await (evalItem.handler as any)(evalContext);
							}

							// Process the returned result
							if (result.success) {
								if ('passed' in result) {
									internal.info(
										`Eval '${evalName}' pass: ${result.passed}`,
										result.metadata
									);
								} else if ('score' in result) {
									internal.info(
										`Eval '${evalName}' score: ${result.score}`,
										result.metadata
									);
								}
							} else {
								internal.error(`Eval '${evalName}' failed: ${result.error}`);
							}

							// Send eval run complete event
							if (shouldSendEvalRunEvents && evalRunEventProvider) {
								internal.info(
									`[EVALRUN] Sending complete event for eval '${evalName}' (id: ${evalRunId})`
								);
								try {
									await evalRunEventProvider.complete({
										id: evalRunId,
										result: result.success ? result : undefined,
										error: result.success ? undefined : result.error,
									});
									internal.info(
										`[EVALRUN] Complete event sent successfully for eval '${evalName}' (id: ${evalRunId})`
									);
								} catch (error) {
									internal.error(
										`[EVALRUN] Error sending eval run complete event for '${evalName}' (id: ${evalRunId})`,
										{
											error,
										}
									);
								}
							}

							internal.debug(`Eval '${evalName}' completed successfully`);
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error);
							internal.error(`Error executing eval '${evalName}'`, { error });

							// Send eval run complete event with error
							if (shouldSendEvalRunEvents && evalRunEventProvider) {
								internal.info(
									`[EVALRUN] Sending complete event (error) for eval '${evalName}' (id: ${evalRunId})`
								);
								try {
									await evalRunEventProvider.complete({
										id: evalRunId,
										error: errorMessage,
									});
									internal.info(
										`[EVALRUN] Complete event (error) sent successfully for eval '${evalName}' (id: ${evalRunId})`
									);
								} catch (eventError) {
									internal.error(
										`[EVALRUN] Error sending eval run complete event (error) for '${evalName}' (id: ${evalRunId})`,
										{ error: eventError }
									);
								}
							}
						}
					})()
				);
			}
		}
	});

	agent.removeEventListener = (eventName: AgentEventName, callback: any): void => {
		const agentForListeners = agent as any as Agent<any, any, any>;
		const callbackForListeners = callback as any as AgentEventCallback<any>;
		const listeners = agentEventListeners.get(agentForListeners);
		if (!listeners) return;
		const callbacks = listeners.get(eventName);
		if (!callbacks) return;
		callbacks.delete(callbackForListeners);
	};

	if (inputSchema) {
		agent.inputSchema = inputSchema;
	}

	if (outputSchema) {
		agent.outputSchema = outputSchema;
	}

	if (config.schema?.stream) {
		agent.stream = config.schema.stream;
	}

	// Add validator method with overloads
	agent.validator = ((override?: any) => {
		const effectiveInputSchema = override?.input ?? inputSchema;
		const effectiveOutputSchema = override?.output ?? outputSchema;

		// Helper to build the standard Hono input validator so types flow
		const buildInputValidator = (schema?: StandardSchemaV1) =>
			validator('json', async (value, c) => {
				if (schema) {
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
				}
				return value;
			});

		// If no output schema, preserve existing behavior: pure input validation
		if (!effectiveOutputSchema) {
			return buildInputValidator(effectiveInputSchema);
		}

		// Output validation middleware (runs after handler)
		const outputValidator: MiddlewareHandler = async (c, next) => {
			await next();

			const res = c.res;
			if (!res) return;

			// Skip output validation for streaming agents
			if (config.schema?.stream) {
				return;
			}

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

			const result = await validateSchema(effectiveOutputSchema, responseBody);
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

		// If we have no input schema, we only do output validation
		if (!effectiveInputSchema) {
			return outputValidator as unknown as Handler;
		}

		// Compose: input validator → output validator
		const inputMiddleware = buildInputValidator(effectiveInputSchema);

		const composed: MiddlewareHandler = async (c, next) => {
			// Run the validator first; its next() runs the output validator,
			// whose next() runs the actual handler(s)
			const result = await inputMiddleware(c, async () => {
				await outputValidator(c, next);
			});
			// If inputMiddleware returned early (validation failed), return that response
			return result;
		};

		return composed as unknown as Handler;
	}) as AgentValidator<TInput, TOutput>;

	return agent as Agent<TInput, TOutput, TStream, TConfig, TAppState>;
}

const runWithSpan = async <
	T,
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
>(
	tracer: Tracer,
	agent: Agent<TInput, TOutput, TStream>,
	handler: () => Promise<T>
): Promise<T> => {
	const currentContext = context.active();
	const span = tracer.startSpan('agent.run', {}, currentContext);

	try {
		const spanContext = trace.setSpan(currentContext, span);
		return await context.with(spanContext, handler);
	} catch (error) {
		span.recordException(error as Error);
		span.setStatus({ code: SpanStatusCode.ERROR });
		throw error;
	} finally {
		span.end();
	}
};

const createAgentRunner = <
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
>(
	agent: Agent<TInput, TOutput, TStream>,
	ctx: Context
): AgentRunner<TInput, TOutput, TStream> => {
	const tracer = ctx.var.tracer;

	if (agent.inputSchema) {
		return {
			metadata: agent.metadata,
			run: async (input: InferSchemaInput<Exclude<TInput, undefined>>) => {
				return runWithSpan<any, TInput, TOutput, TStream>(
					tracer,
					agent,
					async () => await agent.handler(ctx as unknown as AgentContext<any, any, any>, input)
				);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	} else {
		return {
			metadata: agent.metadata,
			run: async () => {
				return runWithSpan<any, TInput, TOutput, TStream>(
					tracer,
					agent,
					async () => await agent.handler(ctx as unknown as AgentContext<any, any, any>)
				);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	}
};

/**
 * Populate the agents object with all registered agents
 * Keys are converted to camelCase to match the generated TypeScript types
 */
export const populateAgentsRegistry = (ctx: Context): any => {
	const agentsObj: any = {};
	// Track ownership of camelCase keys to detect collisions between different raw names
	const ownershipMap = new Map<string, string>();
	const childOwnershipMap = new Map<string, string>();

	// Build nested structure for agents and subagents
	for (const [name, agentFn] of agents) {
		const runner = createAgentRunner(agentFn, ctx);

		if (name.includes('.')) {
			// Subagent: "parent.child"
			const parts = name.split('.');
			if (parts.length !== 2) {
				internal.warn(`Invalid subagent name format: "${name}". Expected "parent.child".`);
				continue;
			}
			const rawParentName = parts[0];
			const rawChildName = parts[1];
			if (rawParentName && rawChildName) {
				// Convert parent name to camelCase for registry key
				const parentKey = toCamelCase(rawParentName);

				// Validate parentKey is non-empty
				if (!parentKey) {
					internal.warn(
						`Agent name "${rawParentName}" converts to empty camelCase key. Skipping.`
					);
					continue;
				}

				// Detect collision on parent key - check ownership
				const existingOwner = ownershipMap.get(parentKey);
				if (existingOwner && existingOwner !== rawParentName) {
					internal.error(
						`Agent registry collision: "${rawParentName}" conflicts with "${existingOwner}" (both map to camelCase key "${parentKey}")`
					);
					throw new Error(`Agent registry collision detected for key "${parentKey}"`);
				}

				if (!agentsObj[parentKey]) {
					// Ensure parent exists - look up by raw name in agents map
					const parentAgent = agents.get(rawParentName);
					if (parentAgent) {
						agentsObj[parentKey] = createAgentRunner(parentAgent, ctx);
						// Record ownership
						ownershipMap.set(parentKey, rawParentName);
					}
				}

				// Attach subagent to parent using camelCase property name
				const childKey = toCamelCase(rawChildName);

				// Validate childKey is non-empty
				if (!childKey) {
					internal.warn(
						`Agent name "${rawChildName}" converts to empty camelCase key. Skipping subagent "${name}".`
					);
					continue;
				}

				// Detect collision on child key - check ownership
				const childOwnershipKey = `${parentKey}.${childKey}`;
				const existingChildOwner = childOwnershipMap.get(childOwnershipKey);
				if (existingChildOwner && existingChildOwner !== name) {
					internal.error(
						`Agent registry collision: subagent "${name}" conflicts with "${existingChildOwner}" (both map to camelCase key "${childOwnershipKey}")`
					);
					throw new Error(
						`Agent registry collision detected for subagent key "${childOwnershipKey}"`
					);
				}

				if (agentsObj[parentKey]) {
					if (agentsObj[parentKey][childKey] === undefined) {
						agentsObj[parentKey][childKey] = runner;
						// Record ownership
						childOwnershipMap.set(childOwnershipKey, name);
					}
				}
			}
		} else {
			// Parent agent or standalone agent - convert to camelCase for registry key
			const parentKey = toCamelCase(name);

			// Validate parentKey is non-empty
			if (!parentKey) {
				internal.warn(`Agent name "${name}" converts to empty camelCase key. Skipping.`);
				continue;
			}

			// Detect collision on parent key - check ownership
			const existingOwner = ownershipMap.get(parentKey);
			if (existingOwner && existingOwner !== name) {
				internal.error(
					`Agent registry collision: "${name}" conflicts with "${existingOwner}" (both map to camelCase key "${parentKey}")`
				);
				throw new Error(`Agent registry collision detected for key "${parentKey}"`);
			}

			if (!agentsObj[parentKey]) {
				agentsObj[parentKey] = runner;
				// Record ownership
				ownershipMap.set(parentKey, name);
			}
		}
	}

	return agentsObj;
};

export const createAgentMiddleware = (agentName: AgentName | ''): MiddlewareHandler => {
	return async (ctx, next) => {
		// Populate agents object with strongly-typed keys
		const agentsObj = populateAgentsRegistry(ctx);

		// Set agent registry on context for access via c.var.agent
		ctx.set('agent', agentsObj);

		// Determine current and parent agents
		let currentAgent: AgentRunner | undefined;
		let parentAgent: AgentRunner | undefined;

		if (agentName?.includes('.')) {
			// This is a subagent
			const parts = agentName.split('.');
			const rawParentName = parts[0];
			const rawChildName = parts[1];
			if (rawParentName && rawChildName) {
				// Use camelCase keys to look up in agentsObj (which uses camelCase keys)
				const parentKey = toCamelCase(rawParentName);
				const childKey = toCamelCase(rawChildName);
				currentAgent = agentsObj[parentKey]?.[childKey];
				parentAgent = agentsObj[parentKey];
			}
		} else if (agentName) {
			// This is a parent or standalone agent - use camelCase key
			const parentKey = toCamelCase(agentName);
			currentAgent = agentsObj[parentKey];
		}

		const _ctx = privateContext(ctx);
		if (currentAgent?.metadata?.id) {
			// we add both so that you can query by either
			_ctx.var.agentIds.add(currentAgent.metadata.id);
			_ctx.var.agentIds.add(currentAgent.metadata.agentId);
		}

		const sessionId = ctx.var.sessionId;
		const thread = ctx.var.thread;
		const session = ctx.var.session;
		const config = agentName ? getAgentConfig(agentName as AgentName) : undefined;
		const app = ctx.var.app;

		const args: RequestAgentContextArgs<
			AgentRegistry,
			AgentRunner | undefined,
			AgentRunner | undefined,
			unknown,
			unknown
		> = {
			agent: agentsObj,
			current: currentAgent,
			parent: parentAgent,
			agentName: agentName as AgentName,
			logger: ctx.var.logger.child({ agent: agentName }),
			tracer: ctx.var.tracer,
			sessionId,
			session,
			thread,
			handler: ctx.var.waitUntilHandler,
			config: config || {},
			app: app || {},
		};

		return runInAgentContext(ctx as unknown as Record<string, unknown>, args, next);
	};
};

export const getAgents = () => agents;

export const runAgentSetups = async (appState: AppState): Promise<void> => {
	for (const [name, agent] of agents.entries()) {
		if (agent.setup) {
			const config = await agent.setup(appState);
			setAgentConfig(name as AgentName, config);
		}
	}
	await notifyReady();
};

export const runAgentShutdowns = async (appState: AppState): Promise<void> => {
	for (const [name, agent] of agents.entries()) {
		if (agent.shutdown) {
			const config = getAgentConfig(name as AgentName);
			await agent.shutdown(appState, config);
		}
	}
};
