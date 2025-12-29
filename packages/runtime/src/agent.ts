/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	StructuredError,
	type KeyValueStorage,
	type StandardSchemaV1,
	type StreamStorage,
	type VectorStorage,
	type SandboxService,
	type InferInput,
	type InferOutput,
	toCamelCase,
	type EvalRunStartEvent,
} from '@agentuity/core';
import { context, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import type { Context, MiddlewareHandler } from 'hono';
import type { Handler } from 'hono/types';
import { validator } from 'hono/validator';
import { AGENT_RUNTIME, INTERNAL_AGENT, CURRENT_AGENT, AGENT_IDS } from './_config';
import {
	getAgentContext,
	inHTTPContext,
	getHTTPContext,
	setupRequestAgentContext,
	getAgentAsyncLocalStorage,
	type RequestAgentContextArgs,
} from './_context';
import type { Logger } from './logger';
import type { Eval, EvalContext, EvalHandlerResult, EvalRunResult, EvalFunction } from './eval';
import { internal } from './logger/internal';
import { fireEvent } from './_events';
import type { Thread, Session } from './session';
import { privateContext } from './_server';
import { generateId } from './session';
import { getEvalRunEventProvider } from './_services';
import * as runtimeConfig from './_config';
import type { AppState } from './index';
import { validateSchema, formatValidationIssues } from './_validation';
import { getAgentMetadataByName, getEvalMetadata } from './_metadata';

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
 * Runtime state container for agents and event listeners.
 * Isolates global state into context for better testing.
 */
export interface AgentRuntimeState {
	agents: Map<string, Agent<any, any, any, any, any>>;
	agentConfigs: Map<string, unknown>;
	agentEventListeners: WeakMap<
		Agent<any, any, any, any, any>,
		Map<AgentEventName, Set<AgentEventCallback<any>>>
	>;
}

/**
 * Context object passed to every agent handler providing access to runtime services and state.
 *
 * @template TAgentRegistry - Registry of all available agents (auto-generated, strongly-typed)
 * @template TConfig - Agent-specific configuration type from setup function
 * @template TAppState - Application-wide state type from createApp
 *
 * @example
 * ```typescript
 * const agent = createAgent('my-agent', {
 *   handler: async (ctx, input) => {
 *     // Logging
 *     ctx.logger.info('Processing request', { input });
 *
 *     // Call another agent (import it directly)
 *     import otherAgent from './other-agent';
 *     const result = await otherAgent.run({ data: input });
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
	_TAgentRegistry extends AgentRegistry = AgentRegistry,
	TConfig = unknown,
	TAppState = Record<string, never>,
> {
	/**
	 * Internal runtime state (agents, configs, event listeners).
	 * Stored with Symbol key to prevent accidental access.
	 * Use getAgentRuntime(ctx) to access.
	 * @internal
	 */
	[AGENT_RUNTIME]: AgentRuntimeState;
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
	 * Sandbox service for creating and running isolated code execution environments.
	 *
	 * @example
	 * ```typescript
	 * // One-shot execution
	 * const result = await ctx.sandbox.run({
	 *   command: {
	 *     exec: ['bun', 'run', 'index.ts'],
	 *     files: { 'index.ts': 'console.log("hello")' }
	 *   }
	 * });
	 * console.log('Exit:', result.exitCode);
	 *
	 * // Interactive sandbox
	 * const sandbox = await ctx.sandbox.create({
	 *   resources: { memory: '1Gi', cpu: '1000m' }
	 * });
	 * await sandbox.execute({ command: ['bun', 'init'] });
	 * await sandbox.execute({ command: ['bun', 'add', 'zod'] });
	 * await sandbox.destroy();
	 * ```
	 */
	sandbox: SandboxService;

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
	 * the unique name for the agent (user-provided).
	 */
	name: string;
	/**
	 * the unique identifier for this project, agent and deployment.
	 */
	id: string;
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
	 * the human readable description for the agent
	 */
	description?: string;
};

type AgentMetadata = InternalAgentMetadata & ExternalAgentMetadata;

/**
 * Configuration object for creating an agent evaluation function.
 *
 * @template TInput - Input schema type from the agent
 * @template TOutput - Output schema type from the agent
 */
export interface CreateEvalConfig<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> {
	/**
	 * Optional description of what this evaluation does.
	 *
	 * @example
	 * ```typescript
	 * description: 'Ensures output is greater than zero'
	 * ```
	 */
	description?: string;

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
		TInput extends StandardSchemaV1 ? InferOutput<TInput> : undefined,
		TOutput extends StandardSchemaV1 ? InferOutput<TOutput> : undefined
	>;
}

export type PresetEvalConfig<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> = CreateEvalConfig<TInput, TOutput> & { name: string };

type CreateEvalMethod<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> = {
	(config: PresetEvalConfig<TInput, TOutput>): Eval<TInput, TOutput>;
	(name: string, config: CreateEvalConfig<TInput, TOutput>): Eval<TInput, TOutput>;
};

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
					out: { json: InferInput<TInput> };
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
			out: { json: InferOutput<TOverrideOutput> };
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
				json: InferInput<TOverrideInput>;
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
 * const eval1 = agent.createEval('check-positive', {
 *   description: 'Ensures result is greater than 5',
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
	 * Gets AgentContext from AsyncLocalStorage, receives validated input, returns output or stream.
	 */
	handler: (...args: any[]) => any | Promise<any>;

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
	 * agent.createEval('check-positive', {
	 *   description: 'Ensures output is a positive number',
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
			context: AgentContext<any, TConfig, TAppState>
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
			context: AgentContext<any, TConfig, TAppState>
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
			context: AgentContext<any, TConfig, TAppState>,
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
			context: AgentContext<any, TConfig, TAppState>
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
			context: AgentContext<any, TConfig, TAppState>
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
			context: AgentContext<any, TConfig, TAppState>,
			data: Error
		) => Promise<void> | void
	): void;
} & (TInput extends StandardSchemaV1 ? { inputSchema: TInput } : { inputSchema?: never }) &
	(TOutput extends StandardSchemaV1 ? { outputSchema: TOutput } : { outputSchema?: never }) &
	(TStream extends true ? { stream: true } : { stream?: false });

type InferSchemaInput<T> = T extends StandardSchemaV1 ? InferOutput<T> : never;

type InferStreamOutput<TOutput, TStream extends boolean> = TStream extends true
	? TOutput extends StandardSchemaV1
		? ReadableStream<InferOutput<TOutput>>
		: ReadableStream<unknown>
	: TOutput extends StandardSchemaV1
		? InferOutput<TOutput>
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
			? ReadableStream<InferOutput<SchemaOutput<TSchema>>>
			: ReadableStream<unknown>
		: SchemaOutput<TSchema> extends StandardSchemaV1
			? InferOutput<SchemaOutput<TSchema>>
			: void;

// Handler signature based on schema + setup result (no self-reference)
type AgentHandlerFromConfig<TSchema, TSetupReturn, TAppState = AppState> =
	SchemaInput<TSchema> extends infer I
		? I extends StandardSchemaV1
			? (
					ctx: AgentContext<any, TSetupReturn, TAppState>,
					input: InferOutput<I>
				) => Promise<SchemaHandlerReturn<TSchema>> | SchemaHandlerReturn<TSchema>
			: (
					ctx: AgentContext<any, TSetupReturn, TAppState>
				) => Promise<SchemaHandlerReturn<TSchema>> | SchemaHandlerReturn<TSchema>
		: (
				ctx: AgentContext<any, TSetupReturn, TAppState>
			) => Promise<SchemaHandlerReturn<TSchema>> | SchemaHandlerReturn<TSchema>;

/**
 * Configuration object for creating an agent with automatic type inference.
 *
 * Passed as the second parameter to createAgent(name, config).
 *
 * @template TSchema - Schema definition object containing optional input, output, and stream properties
 * @template TConfig - Function type that returns agent-specific configuration from setup
 *
 * @example
 * ```typescript
 * const agent = createAgent('greeting', {
 *   description: 'Generates personalized greetings',
 *   schema: {
 *     input: z.object({ name: z.string(), age: z.number() }),
 *     output: z.string()
 *   },
 *   handler: async (ctx, { name, age }) => {
 *     return `Hello, ${name}! You are ${age} years old.`;
 *   }
 * });
 * ```
 */
export interface CreateAgentConfig<
	TSchema extends
		| {
				input?: StandardSchemaV1;
				output?: StandardSchemaV1;
				stream?: boolean;
				examples?: unknown[];
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
	 * Optional description of what this agent does, visible in the Agentuity platform.
	 *
	 * @example
	 * ```typescript
	 * description: 'Returns personalized greetings'
	 * ```
	 */
	description?: string;

	/**
	 * Optional metadata object (typically injected by build plugin during compilation).
	 * Contains agent identification and versioning information.
	 *
	 * @internal - Usually populated by build tooling, not manually set
	 */
	metadata?: Partial<AgentMetadata>;

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

/**
 * The public interface returned by createAgent().
 * Provides methods to run the agent, create evaluations, and manage event listeners.
 *
 * @template TInput - Input schema type (StandardSchemaV1 or undefined if no input)
 * @template TOutput - Output schema type (StandardSchemaV1 or undefined if no output)
 * @template TStream - Whether the agent returns a stream (true/false)
 *
 * @example
 * ```typescript
 * const agent = createAgent('greeting', {
 *   schema: {
 *     input: z.object({ name: z.string() }),
 *     output: z.string()
 *   },
 *   handler: async (ctx, { name }) => `Hello, ${name}!`
 * });
 *
 * // Run the agent
 * const result = await agent.run({ name: 'Alice' });
 *
 * // Create evaluation
 * const evalDef = agent.createEval('greeting-accuracy', {
 *   description: 'Checks if greeting includes the user name',
 *   handler: async (ctx, input, output) => {
 *     return { score: output.includes(input.name) ? 1 : 0 };
 *   }
 * });
 *
 * // Listen to events
 * agent.addEventListener('completed', async (eventName, agent, context) => {
 *   console.log('Agent completed successfully');
 * });
 * ```
 */
export interface AgentRunner<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
> {
	/** Agent metadata (id, name, description, etc.) */
	metadata: AgentMetadata;

	/**
	 * Execute the agent with validated input.
	 * If agent has no input schema, call with no arguments.
	 * If agent has input schema, pass validated input object.
	 *
	 * @example
	 * ```typescript
	 * // Agent with input
	 * const result = await agent.run({ name: 'Alice' });
	 *
	 * // Agent without input
	 * const result = await agent.run();
	 * ```
	 */
	run: undefined extends TInput
		? () => Promise<InferStreamOutput<Exclude<TOutput, undefined>, TStream>>
		: (
				input: InferSchemaInput<Exclude<TInput, undefined>>
			) => Promise<InferStreamOutput<Exclude<TOutput, undefined>, TStream>>;

	/**
	 * Create Hono validator middleware for this agent.
	 * Automatically validates request input against the agent's schema.
	 *
	 * @example
	 * ```typescript
	 * import myAgent from './my-agent';
	 * router.post('/', myAgent.validator(), async (c) => {
	 *   const data = c.req.valid('json'); // Fully typed!
	 *   return c.json(await myAgent.run(data));
	 * });
	 * ```
	 */
	validator: AgentValidator<TInput, TOutput>;

	/** Input schema (if defined) */
	inputSchema?: TInput;

	/** Output schema (if defined) */
	outputSchema?: TOutput;

	/** Whether agent returns a stream */
	stream?: TStream;

	/** Example inputs matching the input schema shape */
	examples?: unknown[];

	/**
	 * Create an evaluation for this agent.
	 * Evaluations run automatically after the agent completes.
	 *
	 * @example
	 * ```typescript
	 * const accuracyEval = agent.createEval('accuracy', {
	 *   description: 'Validates output length is non-zero',
	 *   handler: async (ctx, input, output) => ({
	 *     score: output.length > 0 ? 1 : 0,
	 *     metadata: { outputLength: output.length }
	 *   })
	 * });
	 * ```
	 */
	createEval: CreateEvalMethod<TInput, TOutput>;

	/**
	 * Add event listener for 'started' or 'completed' events.
	 * Listeners fire sequentially in the order they were added.
	 *
	 * @param eventName - 'started' or 'completed'
	 * @param callback - Function to call when event fires
	 *
	 * @example
	 * ```typescript
	 * agent.addEventListener('started', async (eventName, agent, context) => {
	 *   context.logger.info('Agent execution started');
	 * });
	 * ```
	 */
	addEventListener(
		eventName: 'started' | 'completed',
		callback: (
			eventName: 'started' | 'completed',
			agent: Agent<TInput, TOutput, TStream, any, any>,
			context: AgentContext<any, any, any>
		) => Promise<void> | void
	): void;

	/**
	 * Add event listener for 'errored' event.
	 * Fires when agent handler throws an error.
	 *
	 * @param eventName - 'errored'
	 * @param callback - Function to call when error occurs
	 *
	 * @example
	 * ```typescript
	 * agent.addEventListener('errored', async (eventName, agent, context, error) => {
	 *   context.logger.error('Agent failed', { error: error.message });
	 * });
	 * ```
	 */
	addEventListener(
		eventName: 'errored',
		callback: (
			eventName: 'errored',
			agent: Agent<TInput, TOutput, TStream, any, any>,
			context: AgentContext<any, any, any>,
			error: Error
		) => Promise<void> | void
	): void;

	/**
	 * Remove event listener for 'started' or 'completed' events.
	 *
	 * @param eventName - 'started' or 'completed'
	 * @param callback - The same callback function that was added
	 */
	removeEventListener(
		eventName: 'started' | 'completed',
		callback: (
			eventName: 'started' | 'completed',
			agent: Agent<TInput, TOutput, TStream, any, any>,
			context: AgentContext<any, any, any>
		) => Promise<void> | void
	): void;

	/**
	 * Remove event listener for 'errored' event.
	 *
	 * @param eventName - 'errored'
	 * @param callback - The same callback function that was added
	 */
	removeEventListener(
		eventName: 'errored',
		callback: (
			eventName: 'errored',
			agent: Agent<TInput, TOutput, TStream, any, any>,
			context: AgentContext<any, any, any>,
			error: Error
		) => Promise<void> | void
	): void;
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

/**
 * Get the global runtime state (for production use).
 * In tests, use TestAgentContext which has isolated runtime state.
 */
export function getGlobalRuntimeState(): AgentRuntimeState {
	return {
		agents,
		agentConfigs,
		agentEventListeners,
	};
}

/**
 * Get the runtime state from an AgentContext.
 * @internal
 */
export function getAgentRuntime(ctx: AgentContext<any, any, any>): AgentRuntimeState {
	return ctx[AGENT_RUNTIME];
}

// Helper to fire event listeners sequentially, abort on first error
async function fireAgentEvent(
	runtime: AgentRuntimeState,
	agent: Agent<any, any, any, any, any>,
	eventName: 'started' | 'completed',
	context: AgentContext<any, any, any>
): Promise<void>;
async function fireAgentEvent(
	runtime: AgentRuntimeState,
	agent: Agent<any, any, any, any, any>,
	eventName: 'errored',
	context: AgentContext<any, any, any>,
	data: Error
): Promise<void>;
async function fireAgentEvent(
	runtime: AgentRuntimeState,
	agent: Agent<any, any, any, any, any>,
	eventName: AgentEventName,
	context: AgentContext<any, any, any>,
	data?: Error
): Promise<void> {
	// Fire agent-level listeners
	const listeners = runtime.agentEventListeners.get(agent);
	if (listeners) {
		const callbacks = listeners.get(eventName);
		if (callbacks && callbacks.size > 0) {
			for (const callback of callbacks) {
				try {
					if (eventName === 'errored' && data) {
						await (callback as any)(eventName, agent, context, data);
					} else if (eventName === 'started' || eventName === 'completed') {
						await (callback as any)(eventName, agent, context);
					}
				} catch (error) {
					// Log but don't re-throw - event listener errors should not crash the server
					internal.error(`Error in agent event listener for '${eventName}':`, error);
				}
			}
		}
	}

	// Fire global app-level events
	if (eventName === 'errored' && data) {
		await fireEvent('agent.errored', agent, context, data);
	} else if (eventName === 'started') {
		await fireEvent('agent.started', agent, context);
	} else if (eventName === 'completed') {
		await fireEvent('agent.completed', agent, context);
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
	 *   stream: false,
	 *   examples: [{ name: 'Alice' }]
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
		/** Example inputs matching the input schema shape */
		examples?: unknown[];
	};

	/**
	 * Optional description of what this agent does.
	 *
	 * @example
	 * ```typescript
	 * description: 'Does something useful'
	 * ```
	 */
	description?: string;

	/**
	 * Optional metadata object (typically injected by build plugin during compilation).
	 * Contains agent identification and versioning information.
	 *
	 * @internal - Usually populated by build tooling, not manually set
	 */
	metadata?: Partial<AgentMetadata>;

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
						c: AgentContext<any, TConfig, TAppState>,
						input: InferOutput<TInput>
					) =>
						| Promise<ReadableStream<InferOutput<TOutput>>>
						| ReadableStream<InferOutput<TOutput>>
				: (
						c: AgentContext<any, TConfig, TAppState>,
						input: InferOutput<TInput>
					) => Promise<ReadableStream<unknown>> | ReadableStream<unknown>
			: TOutput extends StandardSchemaV1
				? (
						c: AgentContext<any, TConfig, TAppState>,
						input: InferOutput<TInput>
					) => Promise<InferOutput<TOutput>> | InferOutput<TOutput>
				: (
						c: AgentContext<any, TConfig, TAppState>,
						input: InferOutput<TInput>
					) => Promise<void> | void
		: TStream extends true
			? TOutput extends StandardSchemaV1
				? (
						c: AgentContext<any, TConfig, TAppState>
					) =>
						| Promise<ReadableStream<InferOutput<TOutput>>>
						| ReadableStream<InferOutput<TOutput>>
				: (
						c: AgentContext<any, TConfig, TAppState>
					) => Promise<ReadableStream<unknown>> | ReadableStream<unknown>
			: TOutput extends StandardSchemaV1
				? (
						c: AgentContext<any, TConfig, TAppState>
					) => Promise<InferOutput<TOutput>> | InferOutput<TOutput>
				: (c: AgentContext<any, TConfig, TAppState>) => Promise<void> | void;
}

/**
 * Creates an agent with schema validation and lifecycle hooks.
 *
 * This is the recommended way to create agents with automatic type inference from schemas.
 *
 * @template TSchema - Schema definition object containing optional input, output, and stream properties
 * @template TConfig - Function type that returns agent-specific configuration from setup
 *
 * @param name - Unique agent name (must be unique within the project)
 * @param config - Agent configuration object
 *
 * @returns AgentRunner with a run method for executing the agent
 *
 * @example
 * ```typescript
 * const agent = createAgent('greeting-agent', {
 *   description: 'Returns personalized greetings',
 *   schema: {
 *     input: z.object({ name: z.string(), age: z.number() }),
 *     output: z.string()
 *   },
 *   handler: async (ctx, { name, age }) => {
 *     ctx.logger.info(`Processing greeting for ${name}`);
 *     return `Hello, ${name}! You are ${age} years old.`;
 *   }
 * });
 *
 * // Call the agent directly
 * const result = await agent.run({ name: 'Alice', age: 30 });
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
	name: string,
	config: CreateAgentConfig<TSchema, TConfig>
): AgentRunner<SchemaInput<TSchema>, SchemaOutput<TSchema>, SchemaStream<TSchema>>;

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
 * @param name - Unique agent name (must be unique within the project)
 * @param config - Agent configuration object
 *
 * @returns AgentRunner with explicit types and a run method
 *
 * @example
 * ```typescript
 * interface MyAppState { db: Database }
 * interface MyConfig { cache: Map<string, any> }
 *
 * const agent = createAgent<
 *   z.ZodObject<any>, // TInput
 *   z.ZodString,      // TOutput
 *   false            // TStream
 * >('custom-agent', {
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
	name: string,
	config: CreateAgentConfigExplicit<TInput, TOutput, TStream, TConfig, TAppState>
): AgentRunner<TInput, TOutput, TStream>;

// Implementation
export function createAgent<
	TInput extends StandardSchemaV1 | undefined = undefined,
	TOutput extends StandardSchemaV1 | undefined = undefined,
	TStream extends boolean = false,
	TConfig = unknown,
	TAppState = AppState,
>(
	name: string,
	config: CreateAgentConfigExplicit<TInput, TOutput, TStream, TConfig, TAppState>
): AgentRunner<TInput, TOutput, TStream> {
	const inputSchema = config.schema?.input;
	const outputSchema = config.schema?.output;

	// Initialize evals array before handler so it can be captured in closure
	// Evals should only be added via agent.createEval() after agent creation
	const evalsArray: Eval[] = [];

	const handler = async (input?: any) => {
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

		const agentCtx = getAgentContext() as AgentContext<any, TConfig, TAppState>;

		// Store current agent for telemetry (using Symbol to keep it internal)
		(agentCtx as any)[CURRENT_AGENT] = agent;

		const attrs = {
			'@agentuity/agentId': agent.metadata.id,
			'@agentuity/agentInstanceId': agent.metadata.agentId,
			'@agentuity/agentDescription': agent.metadata.description,
			'@agentuity/agentName': agent.metadata.name,
			'@agentuity/threadId': agentCtx.thread.id,
		};

		// Set agent attributes on the current active span
		const activeSpan = trace.getActiveSpan();
		if (activeSpan) {
			activeSpan.setAttributes(attrs);
		}

		if (inHTTPContext()) {
			const honoCtx = privateContext(getHTTPContext());
			if (honoCtx.var.agentIds) {
				if (agent.metadata.id) honoCtx.var.agentIds.add(agent.metadata.id);
				if (agent.metadata.agentId) honoCtx.var.agentIds.add(agent.metadata.agentId);
			}
		} else {
			// For standalone contexts, check for AGENT_IDS symbol
			const agentIds = (agentCtx as any)[AGENT_IDS] as Set<string> | undefined;
			if (agentIds) {
				if (agent.metadata.id) agentIds.add(agent.metadata.id);
				if (agent.metadata.agentId) agentIds.add(agent.metadata.agentId);
			}
		}

		agentCtx.logger = agentCtx.logger.child(attrs);

		// Get the agent instance from the runtime state to fire events
		const runtime = getAgentRuntime(agentCtx);

		// Fire 'started' event
		await fireAgentEvent(runtime, agent as Agent, 'started', agentCtx);

		try {
			// Wrap agent execution with span tracking if tracer is available
			const result = await (async () => {
				if (agentCtx.tracer && inHTTPContext()) {
					const honoCtx = getHTTPContext();
					return runWithSpan<any, TInput, TOutput, TStream>(
						agentCtx.tracer,
						agent as Agent<TInput, TOutput, TStream>,
						honoCtx,
						async () =>
							inputSchema
								? await (config.handler as any)(agentCtx, validatedInput)
								: await (config.handler as any)(agentCtx)
					);
				} else {
					return inputSchema
						? await (config.handler as any)(agentCtx, validatedInput)
						: await (config.handler as any)(agentCtx);
				}
			})();

			let validatedOutput: any = result;
			// Skip output validation for streaming agents (they return ReadableStream)
			if (outputSchema && !config.schema?.stream) {
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
			await fireAgentEvent(runtime, agent as Agent, 'completed', agentCtx);

			return validatedOutput;
		} catch (error) {
			// Fire 'errored' event
			await fireAgentEvent(runtime, agent as Agent, 'errored', agentCtx, error as Error);
			throw error;
		}
	};

	// Infer input/output types from agent schema
	type AgentInput = TInput extends StandardSchemaV1 ? InferOutput<TInput> : undefined;
	type AgentOutput = TOutput extends StandardSchemaV1 ? InferOutput<TOutput> : undefined;

	// Create createEval method that infers types from agent and automatically adds to agent
	const createEval: CreateEvalMethod<TInput, TOutput> = ((
		evalNameOrConfig: string | PresetEvalConfig<TInput, TOutput>,
		evalConfig?: {
			description?: string;
			handler: EvalFunction<AgentInput, AgentOutput>;
			metadata?: {
				id?: string;
				evalId?: string;
				version?: string;
				filename?: string;
			};
		}
	): Eval<TInput, TOutput> => {
		// Handle preset eval config (single argument with name property)
		if (typeof evalNameOrConfig !== 'string' && 'name' in evalNameOrConfig) {
			const presetConfig = evalNameOrConfig as PresetEvalConfig<TInput, TOutput>;
			const evalName = presetConfig.name;

			internal.debug(
				`createEval called for agent "${name || 'unknown'}": registering preset eval "${evalName}"`
			);

			const evalType: any = {
				metadata: {
					identifier: evalName,
					name: evalName,
					description: presetConfig.description || '',
				},
				handler: presetConfig.handler,
			};

			if (inputSchema) {
				evalType.inputSchema = inputSchema;
			}

			if (outputSchema) {
				evalType.outputSchema = outputSchema;
			}

			evalsArray.push(evalType);
			internal.debug(
				`Added preset eval "${evalName}" to agent "${name || 'unknown'}". Total evals: ${evalsArray.length}`
			);

			return evalType as Eval<TInput, TOutput>;
		}

		// Handle custom eval config (name + config)
		if (typeof evalNameOrConfig !== 'string' || !evalConfig) {
			throw new Error(
				'Invalid arguments: expected (name: string, config) or (config: PresetEvalConfig)'
			);
		}

		const evalName = evalNameOrConfig;

		// Trace log to verify evals file is imported
		internal.debug(
			`createEval called for agent "${name || 'unknown'}": registering eval "${evalName}"`
		);

		// Use build-time injected metadata if available (same pattern as agents)
		const evalMetadata = evalConfig.metadata || {};

		// Build eval metadata - merge injected metadata with defaults
		const evalType: any = {
			metadata: {
				// Use build-time injected metadata if available, otherwise fallback to empty/undefined
				id: evalMetadata.id || undefined,
				evalId: evalMetadata.evalId || undefined,
				version: evalMetadata.version || undefined,
				filename: evalMetadata.filename || '',
				identifier: evalName,
				name: evalName,
				description: evalConfig.description || '',
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
			`Added eval "${evalName}" to agent "${name || 'unknown'}". Total evals: ${evalsArray.length}`
		);

		return evalType as Eval<TInput, TOutput>;
	}) as CreateEvalMethod<TInput, TOutput>;

	// Build metadata - merge user-provided metadata with defaults
	// The build plugin injects metadata via config.metadata during AST transformation
	let metadata: Partial<AgentMetadata> = {
		// Defaults (used when running without build, e.g., dev mode)
		name,
		description: config.description,
		id: '',
		agentId: '',
		filename: '',
		version: '',
		inputSchemaCode: '',
		outputSchemaCode: '',
		// Merge in build-time injected metadata (overrides defaults)
		...config.metadata,
	};

	// If id/agentId are empty, try to load from agentuity.metadata.json
	if (!metadata.id || !metadata.agentId) {
		const fileMetadata = getAgentMetadataByName(name);
		if (fileMetadata) {
			internal.info(
				'[agent] loaded metadata for "%s" from file: id=%s, agentId=%s',
				name,
				fileMetadata.id,
				fileMetadata.agentId
			);
			metadata = {
				...metadata,
				id: fileMetadata.id || metadata.id,
				agentId: fileMetadata.agentId || metadata.agentId,
				filename: fileMetadata.filename || metadata.filename,
				version: fileMetadata.version || metadata.version,
			};
		}
	}

	const agent: any = {
		handler,
		metadata,
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
		// Use the agent instance passed to event listener to access its evals array
		// This ensures we get evals that were added via agent.createEval() after agent creation
		const agentEvals = _agent?.evals || evalsArray;

		internal.debug(
			`Checking evals: agent=${_agent.metadata?.name}, evalsArray.length=${evalsArray?.length || 0}, agent.evals.length=${_agent?.evals?.length || 0}`
		);

		if (agentEvals && agentEvals.length > 0) {
			internal.info(`Executing ${agentEvals.length} eval(s) after agent run`);

			// Get validated input/output from context state
			const validatedInput = ctx.state.get('_evalInput');
			const validatedOutput = ctx.state.get('_evalOutput');

			// Capture agentRunSpanId synchronously before waitUntil (which may run outside AsyncLocalStorage)
			let agentRunSpanId: string | undefined;
			try {
				const httpCtx = getHTTPContext();
				const _httpCtx = privateContext(httpCtx);
				agentRunSpanId = _httpCtx.var.agentRunSpanId;
			} catch {
				// HTTP context may not be available, spanId will be undefined
			}

			// Execute each eval using waitUntil to avoid blocking the response
			for (const evalItem of agentEvals) {
				const evalName = evalItem.metadata.name || 'unnamed';
				const agentName = _agent?.metadata?.name || name;

				ctx.waitUntil(
					(async () => {
						internal.info(`[EVALRUN] Starting eval run tracking for '${evalName}'`);
						const evalRunId = generateId('evalrun');

						// Look up eval metadata from agentuity.metadata.json by agent name and eval name
						internal.info(
							`[EVALRUN] Looking up eval metadata: agentName='${agentName}', evalName='${evalName}'`
						);
						const evalMeta = getEvalMetadata(agentName, evalName);
						internal.info(`[EVALRUN] Eval metadata lookup result:`, {
							found: !!evalMeta,
							evalId: evalMeta?.evalId,
							id: evalMeta?.id,
							filename: evalMeta?.filename,
						});

						// evalId = deployment-specific ID (evalid_...), evalIdentifier = stable (eval_...)
						const evalId = evalMeta?.id || '';
						const evalIdentifier = evalMeta?.evalId || '';
						internal.info(
							`[EVALRUN] Resolved evalId='${evalId}', evalIdentifier='${evalIdentifier}'`
						);

						// Log eval metadata using structured logging and tracing
						ctx.logger.debug('Starting eval run with metadata', {
							evalName,
							agentName,
							evalRunId,
							evalId,
							evalMetaFromFile: !!evalMeta,
							evalMetadata: evalItem.metadata,
						});

						// Add eval metadata to the active span for observability
						const activeSpan = ctx.tracer ? trace.getActiveSpan() : undefined;
						if (activeSpan) {
							activeSpan.setAttributes({
								'eval.name': evalName,
								'eval.id': evalId,
								'eval.runId': evalRunId,
								'eval.description':
									evalMeta?.description || evalItem.metadata.description || '',
								'eval.filename': evalMeta?.filename || evalItem.metadata.filename || '',
							});
						}

						const orgId = runtimeConfig.getOrganizationId();
						const projectId = runtimeConfig.getProjectId();
						const devMode = runtimeConfig.isDevMode() ?? false;
						const evalRunEventProvider = getEvalRunEventProvider();

						// Only send events if we have required context (devmode flag will be set based on devMode)
						const shouldSendEvalRunEvents =
							orgId && projectId && evalId !== '' && evalIdentifier !== '';

						internal.info(`[EVALRUN] Checking conditions for eval '${evalName}':`, {
							orgId: orgId,
							projectId: projectId,
							evalId: evalId,
							evalIdentifier: evalIdentifier,
							devMode,
							hasEvalRunEventProvider: !!evalRunEventProvider,
							shouldSendEvalRunEvents,
						});

						if (!shouldSendEvalRunEvents) {
							const reasons: string[] = [];
							if (!orgId) reasons.push('missing orgId');
							if (!projectId) reasons.push('missing projectId');
							if (!evalId || evalId === '') reasons.push('empty evalId');
							if (!evalIdentifier || evalIdentifier === '')
								reasons.push('empty evalIdentifier');
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
									// Use captured agentRunSpanId (may be undefined if HTTP context unavailable)
									if (!agentRunSpanId) {
										internal.warn(
											`[EVALRUN] agentRunSpanId not available for eval '${evalName}' (id: ${evalRunId}). This may occur if waitUntil runs outside AsyncLocalStorage context.`
										);
									}
									const startEvent: EvalRunStartEvent = {
										id: evalRunId,
										sessionId: ctx.sessionId,
										evalId: evalId, // deployment-specific ID (evalid_...)
										evalIdentifier: evalIdentifier, // stable identifier (eval_...)
										orgId: orgId!,
										projectId: projectId!,
										devmode: Boolean(devMode),
										deploymentId: deploymentId || undefined,
										spanId: agentRunSpanId,
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
							let handlerResult: EvalHandlerResult;
							if (inputSchema && outputSchema) {
								// Both input and output defined
								handlerResult = await (evalItem.handler as any)(
									evalContext,
									evalValidatedInput,
									evalValidatedOutput
								);
							} else if (inputSchema) {
								// Only input defined
								handlerResult = await (evalItem.handler as any)(
									evalContext,
									evalValidatedInput
								);
							} else if (outputSchema) {
								// Only output defined
								handlerResult = await (evalItem.handler as any)(
									evalContext,
									evalValidatedOutput
								);
							} else {
								// Neither defined
								handlerResult = await (evalItem.handler as any)(evalContext);
							}

							// Wrap handler result with success for catalyst
							const result: EvalRunResult = {
								success: true,
								...handlerResult,
							};

							// Log the result
							if (result.score !== undefined) {
								internal.info(
									`Eval '${evalName}' pass: ${result.passed}, score: ${result.score}`,
									result.metadata
								);
							} else {
								internal.info(`Eval '${evalName}' pass: ${result.passed}`, result.metadata);
							}

							// Send eval run complete event
							if (shouldSendEvalRunEvents && evalRunEventProvider) {
								internal.info(
									`[EVALRUN] Sending complete event for eval '${evalName}' (id: ${evalRunId})`
								);
								try {
									await evalRunEventProvider.complete({
										id: evalRunId,
										result,
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
										result: {
											success: false,
											passed: false,
											error: errorMessage,
											metadata: {},
										},
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

	if (config.schema?.examples) {
		agent.examples = config.schema.examples;
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

	// Register the agent for runtime use
	// @ts-expect-error - metadata might be incomplete until build plugin injects InternalAgentMetadata
	agents.set(name, agent as Agent<TInput, TOutput, TStream, TConfig, TAppState>);

	// Create and return AgentRunner
	const runner: any = {
		metadata: metadata as AgentMetadata,
		validator: agent.validator,
		inputSchema: inputSchema as TInput,
		outputSchema: outputSchema as TOutput,
		stream: (config.schema?.stream as TStream) || (false as TStream),
		createEval,
		addEventListener: agent.addEventListener,
		removeEventListener: agent.removeEventListener,
		run: inputSchema
			? async (input: InferSchemaInput<Exclude<TInput, undefined>>) => {
					return await agent.handler(input);
				}
			: async () => {
					return await agent.handler();
				},
		[INTERNAL_AGENT]: agent, // Store reference to internal agent for testing
	};

	return runner as AgentRunner<TInput, TOutput, TStream>;
}

const runWithSpan = async <
	T,
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
>(
	tracer: Tracer,
	agent: Agent<TInput, TOutput, TStream>,
	ctx: Context,
	handler: () => Promise<T>
): Promise<T> => {
	const currentContext = context.active();
	const span = tracer.startSpan('agent.run', {}, currentContext);

	// Set agent attributes on the span immediately after creation
	span.setAttributes({
		'@agentuity/agentId': agent.metadata.id,
		'@agentuity/agentInstanceId': agent.metadata.agentId,
		'@agentuity/agentDescription': agent.metadata.description,
		'@agentuity/agentName': agent.metadata.name,
		'@agentuity/threadId': ctx.var.thread.id,
	});

	const spanId = span.spanContext().spanId;

	// Store span ID in PrivateVariables
	const _ctx = privateContext(ctx);
	_ctx.set('agentRunSpanId', spanId);

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
					ctx,
					async () => await agent.handler(input)
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
					ctx,
					async () => await agent.handler()
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

	// Build flat registry of agents
	for (const [name, agentFn] of agents) {
		const runner = createAgentRunner(agentFn, ctx);
		const key = toCamelCase(name);

		// Validate key is non-empty
		if (!key) {
			internal.warn(`Agent name "${name}" converts to empty camelCase key. Skipping.`);
			continue;
		}

		// Detect collision on key - check ownership
		const existingOwner = ownershipMap.get(key);
		if (existingOwner && existingOwner !== name) {
			internal.error(
				`Agent registry collision: "${name}" conflicts with "${existingOwner}" (both map to camelCase key "${key}")`
			);
			throw new Error(`Agent registry collision detected for key "${key}"`);
		}

		agentsObj[key] = runner;
		// Record ownership
		ownershipMap.set(key, name);
	}

	return agentsObj;
};

export const createAgentMiddleware = (agentName: AgentName | ''): MiddlewareHandler => {
	return async (ctx, next) => {
		// Populate agents object with strongly-typed keys
		const agentsObj = populateAgentsRegistry(ctx);

		// Track agent ID for session telemetry
		if (agentName) {
			const agentKey = toCamelCase(agentName);
			const agent = agentsObj[agentKey];
			const _ctx = privateContext(ctx);
			// we add both so that you can query by either
			if (agent?.metadata?.id) {
				_ctx.var.agentIds.add(agent.metadata.id);
			}
			if (agent?.metadata?.agentId) {
				_ctx.var.agentIds.add(agent.metadata.agentId);
			}
		}

		const sessionId = ctx.var.sessionId;
		const thread = ctx.var.thread;
		const session = ctx.var.session;
		const config = agentName ? getAgentConfig(agentName as AgentName) : undefined;
		const app = ctx.var.app;

		const args: RequestAgentContextArgs<AgentRegistry, unknown, unknown> = {
			agent: agentsObj,
			logger: ctx.var.logger,
			tracer: ctx.var.tracer,
			sessionId,
			session,
			thread,
			handler: ctx.var.waitUntilHandler,
			config: config || {},
			app: app || {},
			runtime: getGlobalRuntimeState(),
		};

		return setupRequestAgentContext(ctx as unknown as Record<string, unknown>, args, next);
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
	// Note: Server readiness is managed by Vite (dev) or Bun.serve (prod)
};

export const runAgentShutdowns = async (appState: AppState): Promise<void> => {
	const runtime = getGlobalRuntimeState();
	for (const [name, agent] of runtime.agents.entries()) {
		if (agent.shutdown) {
			const config = runtime.agentConfigs.get(name) as any;
			await agent.shutdown(appState, config);
		}
	}
};

/**
 * Run an agent within a specific AgentContext.
 * Sets up AsyncLocalStorage with the provided context and executes the agent.
 *
 * This is the recommended way to test agents in unit tests. It automatically:
 * - Registers the agent in the runtime state so event listeners fire
 * - Sets up AsyncLocalStorage so getAgentContext() works inside the agent
 * - Handles both agents with input and agents without input
 *
 * **Use cases:**
 * - Unit testing agents with TestAgentContext
 * - Running agents outside HTTP request flow
 * - Custom agent execution environments
 * - Testing event listeners and evaluations
 *
 * @template TInput - Type of the input parameter
 * @template TOutput - Type of the return value
 *
 * @param ctx - The AgentContext to use (typically TestAgentContext in tests)
 * @param agent - The AgentRunner to execute (returned from createAgent)
 * @param input - Input data (required if agent has input schema, omit otherwise)
 *
 * @returns Promise resolving to the agent's output
 *
 * @example
 * ```typescript
 * import { runInAgentContext, TestAgentContext } from '@agentuity/runtime/test';
 *
 * test('greeting agent', async () => {
 *   const ctx = new TestAgentContext();
 *   const result = await runInAgentContext(ctx, greetingAgent, {
 *     name: 'Alice',
 *     age: 30
 *   });
 *   expect(result).toBe('Hello, Alice! You are 30 years old.');
 * });
 *
 * test('no-input agent', async () => {
 *   const ctx = new TestAgentContext();
 *   const result = await runInAgentContext(ctx, statusAgent);
 *   expect(result).toEqual({ status: 'ok' });
 * });
 * ```
 */
export async function runInAgentContext<TInput, TOutput>(
	ctx: AgentContext<any, any, any>,
	agent: AgentRunner<any, any, any>,
	input?: TInput
): Promise<TOutput> {
	const storage = getAgentAsyncLocalStorage();

	// Register agent in runtime state so events fire (lookup by metadata.name)
	const agentName = agent.metadata.name;
	const runtime = getAgentRuntime(ctx);

	// Get internal agent from runner (stored via symbol) or global registry
	const internalAgent = (agent as any)[INTERNAL_AGENT] || agents.get(agentName);

	if (internalAgent && agentName) {
		runtime.agents.set(agentName, internalAgent);

		// Copy event listeners from global to context runtime
		const globalListeners = agentEventListeners.get(internalAgent);
		if (globalListeners) {
			runtime.agentEventListeners.set(internalAgent, globalListeners);
		}
	}

	return storage.run(ctx, async () => {
		if (input !== undefined) {
			return await (agent.run as any)(input);
		} else {
			return await (agent.run as any)();
		}
	});
}
