/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	StandardSchemaV1,
	KeyValueStorage,
	ObjectStorage,
	StreamStorage,
	VectorStorage,
} from '@agentuity/core';
import { trace, type Tracer } from '@opentelemetry/api';

import type { Context, MiddlewareHandler } from 'hono';
import { getAgentContext, runInAgentContext, type RequestAgentContextArgs } from './_context';
import type { Logger } from './logger';
import { getApp } from './app';

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

	const agent: any = {
		metadata: config.metadata,
		addEventListener: (eventName: AgentEventName, callback: AgentEventCallback<any>) => {
			let listeners = agentEventListeners.get(agent);
			if (!listeners) {
				listeners = new Map();
				agentEventListeners.set(agent, listeners);
			}
			let callbacks = listeners.get(eventName);
			if (!callbacks) {
				callbacks = new Set();
				listeners.set(eventName, callbacks);
			}
			callbacks.add(callback);
		},
		removeEventListener: (eventName: AgentEventName, callback: AgentEventCallback<any>) => {
			const listeners = agentEventListeners.get(agent);
			if (!listeners) return;
			const callbacks = listeners.get(eventName);
			if (!callbacks) return;
			callbacks.delete(callback);
		},
		handler: async (_ctx: Context, input?: any) => {
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

			try {
				// Fire 'started' event
				await fireAgentEvent(agent, 'started', agentCtx);

				// Execute the handler
				const result = inputSchema
					? await (config.handler as any)(agentCtx, validatedInput)
					: await (config.handler as any)(agentCtx);

				if (outputSchema) {
					const outputResult = await outputSchema['~standard'].validate(result);
					if (outputResult.issues) {
						throw new Error(
							`Output validation failed: ${outputResult.issues.map((i: any) => i.message).join(', ')}`
						);
					}
					// Fire 'completed' event before returning
					await fireAgentEvent(agent, 'completed', agentCtx);
					return outputResult.value;
				}

				// Fire 'completed' event before returning
				await fireAgentEvent(agent, 'completed', agentCtx);
				return result;
			} catch (error) {
				// Fire 'errored' event with the error, catching any listener errors
				try {
					await fireAgentEvent(agent, 'errored', agentCtx, error as Error);
				} catch (listenerError) {
					// Listener failed - preserve both errors
					throw new AggregateError(
						[error, listenerError],
						`Handler error and listener error occurred`
					);
				}
				// Re-throw the original handler error
				throw error;
			}
		},
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

const createAgentRunner = <
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
>(
	agent: Agent<TInput, TOutput, TStream>,
	ctx: Context
): AgentRunner<TInput, TOutput, TStream> => {
	if (agent.inputSchema) {
		return {
			metadata: agent.metadata,
			run: async (input: any) => {
				return agent.handler(ctx as unknown as AgentContext, input);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	} else {
		return {
			metadata: agent.metadata,
			run: async () => {
				return agent.handler(ctx as unknown as AgentContext);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	}
};

export const createAgentMiddleware = (agentName: AgentName): MiddlewareHandler => {
	return async (ctx, next) => {
		// Detect websocket upgrade requests
		const isWebSocket = ctx.req.header('upgrade')?.toLowerCase() === 'websocket';

		// Populate agents object with strongly-typed keys
		const agentsObj: any = {};

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
					// Attach subagent to parent
					if (agentsObj[parentName]) {
						agentsObj[parentName][childName] = runner;
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

		if (agentName && agentName.includes('.')) {
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

		const args: Partial<RequestAgentContextArgs<AgentRegistry, any>> = {
			agent: agentsObj,
			current: currentAgent,
			parent: parentAgent,
			agentName,
			logger: ctx.var.logger.child({ agent: agentName }),
			tracer: ctx.var.tracer,
			setHeader: (k: string, v: string) => ctx.res.headers.set(k, v),
		};

		const span = trace.getActiveSpan();
		if (span?.spanContext) {
			args.sessionId = span.spanContext().traceId;
		} else {
			args.sessionId = Bun.randomUUIDv7();
		}

		return runInAgentContext(
			ctx as unknown as Record<string, unknown>,
			args as RequestAgentContextArgs<any, any>,
			next,
			isWebSocket
		);

		// FIXME
		// ctx.email = async (): Promise<Email> => {
		//     return {
		//         address: 'test@example.com',
		//         name: 'Test User',
		//         html: '<p>Hello, world!</p>',
		//         text: 'Hello, world!',
		//     };
		// };
		// ctx.sms = async (): Promise<SMS> => {
		//     return {
		//         message: 'Hello, world!',
		//         number: '+1234567890',
		//     };
		// };
		// ctx.cron = async (): Promise<Cron> => {
		//     return {
		//         schedule: '0 0 * * *',
		//     };
		// };
	};
};
