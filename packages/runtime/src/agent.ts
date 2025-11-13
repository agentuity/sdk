/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	KeyValueStorage,
	ObjectStorage,
	StandardSchemaV1,
	StreamStorage,
	VectorStorage,
} from '@agentuity/core';
import type { Tracer } from '@opentelemetry/api';
import { SpanStatusCode, context, trace } from '@opentelemetry/api';
import type { Context, MiddlewareHandler } from 'hono';
import { getAgentContext, runInAgentContext, type RequestAgentContextArgs } from './_context';
import type { Logger } from './logger';
import type { Eval, EvalContext, EvalRunResult, EvalMetadata, EvalFunction } from './eval';
import { internal } from './logger/internal';
import { getApp } from './app';
import type { Thread, Session } from './session';
import { privateContext } from './_server';

export type AgentEventName = 'started' | 'completed' | 'errored';

export type AgentEventCallback<TAgent extends Agent<any, any, any>> =
	| ((eventName: 'started', agent: TAgent, context: AgentContext) => Promise<void> | void)
	| ((eventName: 'completed', agent: TAgent, context: AgentContext) => Promise<void> | void)
	| ((
			eventName: 'errored',
			agent: TAgent,
			context: AgentContext,
			data: Error
	  ) => Promise<void> | void);

export interface AgentContext {
	//   email: () => Promise<Email | null>;
	//   sms: () => Promise<SMS | null>;
	//   cron: () => Promise<Cron | null>;
	waitUntil: (promise: Promise<void> | (() => void | Promise<void>)) => void;
	agent?: any; // Will be augmented by generated code
	current?: any; // Will be augmented by generated code
	parent?: any; // Will be augmented by generated code - reference to parent agent for subagents
	agentName?: AgentName;
	logger: Logger;
	sessionId: string;
	tracer: Tracer;
	kv: KeyValueStorage;
	objectstore: ObjectStorage;
	stream: StreamStorage;
	vector: VectorStorage;
	state: Map<string, unknown>;
	thread: Thread;
	session: Session;
}

interface AgentMetadata {
	/**
	 * the unique identifier for this agent and project
	 */
	id: string;
	/**
	 * the folder name for the agent
	 */
	identifier: string;
	/**
	 * the human readable name for the agent (identifier is used if not specified)
	 */
	name: string;
	/**
	 * the human readable description for the agent (empty if not provided)
	 */
	description: string;
	/**
	 * the relative path to the agent from the root project directory
	 */
	filename: string;
	/**
	 * a unique version for the agent. computed as the SHA256 contents of the file.
	 */
	version: string;
}

// Type for createEval method
type CreateEvalMethod<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> = (config: {
	metadata?: EvalMetadata;
	handler: EvalFunction<
		TInput extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TInput> : undefined,
		TOutput extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TOutput> : undefined
	>;
}) => Eval<TInput, TOutput>;

/**
 * The Agent handler interface.
 */
export type Agent<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
> = {
	metadata: AgentMetadata;
	handler: (ctx: AgentContext, ...args: any[]) => any | Promise<any>;
	evals?: Eval[];
	createEval: CreateEvalMethod<TInput, TOutput>;
	addEventListener(
		eventName: 'started',
		callback: (
			eventName: 'started',
			agent: Agent<TInput, TOutput, TStream>,
			context: AgentContext
		) => Promise<void> | void
	): void;
	addEventListener(
		eventName: 'completed',
		callback: (
			eventName: 'completed',
			agent: Agent<TInput, TOutput, TStream>,
			context: AgentContext
		) => Promise<void> | void
	): void;
	addEventListener(
		eventName: 'errored',
		callback: (
			eventName: 'errored',
			agent: Agent<TInput, TOutput, TStream>,
			context: AgentContext,
			data: Error
		) => Promise<void> | void
	): void;
	removeEventListener(
		eventName: 'started',
		callback: (
			eventName: 'started',
			agent: Agent<TInput, TOutput, TStream>,
			context: AgentContext
		) => Promise<void> | void
	): void;
	removeEventListener(
		eventName: 'completed',
		callback: (
			eventName: 'completed',
			agent: Agent<TInput, TOutput, TStream>,
			context: AgentContext
		) => Promise<void> | void
	): void;
	removeEventListener(
		eventName: 'errored',
		callback: (
			eventName: 'errored',
			agent: Agent<TInput, TOutput, TStream>,
			context: AgentContext,
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
const agents = new Map<string, Agent>();

// WeakMap to store event listeners for each agent instance (truly private)
const agentEventListeners = new WeakMap<
	Agent<any, any, any>,
	Map<AgentEventName, Set<AgentEventCallback<any>>>
>();

// Helper to fire event listeners sequentially, abort on first error
async function fireAgentEvent(
	agent: Agent<any, any, any>,
	eventName: 'started' | 'completed',
	context: AgentContext
): Promise<void>;
async function fireAgentEvent(
	agent: Agent<any, any, any>,
	eventName: 'errored',
	context: AgentContext,
	data: Error
): Promise<void>;
async function fireAgentEvent(
	agent: Agent<any, any, any>,
	eventName: AgentEventName,
	context: AgentContext,
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
export type AgentName = string;
export type AgentRegistry = Record<AgentName, AgentRunner>;

export const registerAgent = (name: AgentName, agent: Agent): void => {
	agents.set(name, agent);
};

export function createAgent<
	TInput extends StandardSchemaV1 | undefined = undefined,
	TOutput extends StandardSchemaV1 | undefined = undefined,
	TStream extends boolean = false,
>(config: {
	schema?: {
		input?: TInput;
		output?: TOutput;
		stream?: TStream;
	};
	metadata?: Partial<Omit<AgentMetadata, 'id'>>;
	handler: TInput extends StandardSchemaV1
		? TStream extends true
			? TOutput extends StandardSchemaV1
				? (
						c: AgentContext,
						input: StandardSchemaV1.InferOutput<TInput>
					) =>
						| Promise<ReadableStream<StandardSchemaV1.InferOutput<TOutput>>>
						| ReadableStream<StandardSchemaV1.InferOutput<TOutput>>
				: (
						c: AgentContext,
						input: StandardSchemaV1.InferOutput<TInput>
					) => Promise<ReadableStream<unknown>> | ReadableStream<unknown>
			: TOutput extends StandardSchemaV1
				? (
						c: AgentContext,
						input: StandardSchemaV1.InferOutput<TInput>
					) =>
						| Promise<StandardSchemaV1.InferOutput<TOutput>>
						| StandardSchemaV1.InferOutput<TOutput>
				: (c: AgentContext, input: StandardSchemaV1.InferOutput<TInput>) => Promise<void> | void
		: TStream extends true
			? TOutput extends StandardSchemaV1
				? (
						c: AgentContext
					) =>
						| Promise<ReadableStream<StandardSchemaV1.InferOutput<TOutput>>>
						| ReadableStream<StandardSchemaV1.InferOutput<TOutput>>
				: (c: AgentContext) => Promise<ReadableStream<unknown>> | ReadableStream<unknown>
			: TOutput extends StandardSchemaV1
				? (
						c: AgentContext
					) =>
						| Promise<StandardSchemaV1.InferOutput<TOutput>>
						| StandardSchemaV1.InferOutput<TOutput>
				: (c: AgentContext) => Promise<void> | void;
}): Agent<TInput, TOutput, TStream> {
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
				throw new Error(
					`Input validation failed: ${inputResult.issues.map((i: any) => i.message).join(', ')}`
				);
			}
			validatedInput = inputResult.value;
		}

		const agentCtx = getAgentContext();

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
					throw new Error(
						`Output validation failed: ${outputResult.issues.map((i: any) => i.message).join(', ')}`
					);
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
		metadata?: EvalMetadata;
		handler: EvalFunction<AgentInput, AgentOutput>;
	}): Eval<TInput, TOutput> => {
		const evalName = evalConfig.metadata?.name || 'unnamed';
		// Debug log to verify evals file is imported
		if (typeof process !== 'undefined' && process.env?.AGENTUITY_SDK_DEV_MODE === 'true') {
			console.log(
				`[DEBUG] createEval called for agent "${config?.metadata?.name || 'unknown'}": registering eval "${evalName}"`
			);
		}

		const evalType: any = {
			metadata: evalConfig.metadata,
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
		if (typeof process !== 'undefined' && process.env?.AGENTUITY_SDK_DEV_MODE === 'true') {
			console.log(
				`[DEBUG] Added eval "${evalName}" to agent "${config?.metadata?.name || 'unknown'}". Total evals: ${evalsArray.length}`
			);
		}

		return evalType as Eval<TInput, TOutput>;
	};

	const agent: any = {
		handler,
		metadata: config.metadata,
		evals: evalsArray,
		createEval,
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
				const evalName = evalItem.metadata?.name || 'unnamed';

				ctx.waitUntil(
					(async () => {
						try {
							internal.debug(`Executing eval: ${evalName}`);

							// Validate eval input if schema exists
							let evalValidatedInput: any = validatedInput;
							if (evalItem.inputSchema) {
								const evalInputResult =
									await evalItem.inputSchema['~standard'].validate(validatedInput);
								if (evalInputResult.issues) {
									throw new Error(
										`Eval input validation failed: ${evalInputResult.issues.map((i: any) => i.message).join(', ')}`
									);
								}
								evalValidatedInput = evalInputResult.value;
							}

							// Validate eval output if schema exists
							let evalValidatedOutput: any = validatedOutput;
							if (evalItem.outputSchema) {
								const evalOutputResult =
									await evalItem.outputSchema['~standard'].validate(validatedOutput);
								if (evalOutputResult.issues) {
									throw new Error(
										`Eval output validation failed: ${evalOutputResult.issues.map((i: any) => i.message).join(', ')}`
									);
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

							internal.debug(`Eval '${evalName}' completed successfully`);
						} catch (error) {
							internal.error(`Error executing eval '${evalName}'`, { error });
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

	return agent as Agent<TInput, TOutput, TStream>;
}

const runWithSpan = async <T>(
	tracer: Tracer,
	agent: Agent<any, any, any>,
	handler: () => Promise<T>
): Promise<T> => {
	const currentContext = context.active();
	const span = tracer.startSpan(
		'agent.run',
		{
			attributes: {
				'@agentuity/agentName': agent.metadata?.name || '',
				'@agentuity/agentId': agent.metadata?.id || '',
			},
		},
		currentContext
	);

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
			run: async (input: any) => {
				return runWithSpan(tracer, agent as Agent<any, any, any>, () =>
					agent.handler(ctx as unknown as AgentContext, input)
				);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	} else {
		return {
			metadata: agent.metadata,
			run: async () => {
				return runWithSpan(tracer, agent as Agent<any, any, any>, () =>
					agent.handler(ctx as unknown as AgentContext)
				);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	}
};

export const createAgentMiddleware = (agentName: AgentName): MiddlewareHandler => {
	return async (ctx, next) => {
		// Populate agents object with strongly-typed keys
		const agentsObj: any = {};

		// Convert kebab-case to camelCase
		const toCamelCase = (str: string): string => {
			return str
				.replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
				.replace(/^(.)/, (char) => char.toLowerCase());
		};

		// Build nested structure for agents and subagents
		for (const [name, agentFn] of agents) {
			const runner = createAgentRunner(agentFn, ctx);

			if (name.includes('.')) {
				// Subagent: "parent.child"
				const parts = name.split('.');
				const parentName = parts[0];
				const childName = parts[1];
				if (parentName && childName) {
					if (!agentsObj[parentName]) {
						// Ensure parent exists
						const parentAgent = agents.get(parentName);
						if (parentAgent) {
							agentsObj[parentName] = createAgentRunner(parentAgent, ctx);
						}
					}
					// Attach subagent to parent using camelCase property name
					if (agentsObj[parentName]) {
						const camelChildName = toCamelCase(childName);
						agentsObj[parentName][camelChildName] = runner;
					}
				}
			} else {
				// Parent agent or standalone agent
				agentsObj[name] = runner;
			}
		}

		// Determine current and parent agents
		let currentAgent: AgentRunner | undefined;
		let parentAgent: AgentRunner | undefined;

		if (agentName?.includes('.')) {
			// This is a subagent
			const parts = agentName.split('.');
			const parentName = parts[0];
			const childName = parts[1];
			if (parentName && childName) {
				currentAgent = agentsObj[parentName]?.[childName];
				parentAgent = agentsObj[parentName];
			}
		} else if (agentName) {
			// This is a parent or standalone agent
			currentAgent = agentsObj[agentName];
		}

		const _ctx = privateContext(ctx);
		if (currentAgent?.metadata?.id) {
			_ctx.var.agentIds.add(currentAgent.metadata.id);
		}

		const sessionId = ctx.var.sessionId;
		const thread = ctx.var.thread;
		const session = ctx.var.session;

		const args: Partial<RequestAgentContextArgs<AgentRegistry, any>> = {
			agent: agentsObj,
			current: currentAgent,
			parent: parentAgent,
			agentName,
			logger: ctx.var.logger.child({ agent: agentName }),
			tracer: ctx.var.tracer,
			sessionId,
			session,
			thread,
			handler: ctx.var.waitUntilHandler,
		};

		return runInAgentContext(
			ctx as unknown as Record<string, unknown>,
			args as RequestAgentContextArgs<any, any>,
			next
		);
	};
};
