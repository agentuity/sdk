/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StandardSchemaV1 } from '@sdk-mono/core';
import type { Context, MiddlewareHandler } from 'hono';
import { RequestAgentContext, runInAgentContext } from './_context';

export interface AgentContext {
	//   email: () => Promise<Email | null>;
	//   sms: () => Promise<SMS | null>;
	//   cron: () => Promise<Cron | null>;
	waitUntil: (callback: () => Promise<void>) => Promise<void>;
	agent?: any; // Will be augmented by generated code
}

/**
 * The Agent handler interface.
 */
export type Agent<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
	TStream extends boolean = false,
> = {
	handler: (ctx: AgentContext, ...args: any[]) => any | Promise<any>;
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
	run: undefined extends TInput
		? () => Promise<InferStreamOutput<Exclude<TOutput, undefined>, TStream>>
		: (
				input: InferSchemaInput<Exclude<TInput, undefined>>
			) => Promise<InferStreamOutput<Exclude<TOutput, undefined>, TStream>>;
}

// Will be populated at runtime with strongly typed agents
const agents = new Map<string, Agent>();

export const registerAgent = (name: string, agent: Agent): void => {
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

	const handler = async (ctx: Context, input?: any) => {
		let validatedInput: any = undefined;

		if (inputSchema) {
			const inputResult = await inputSchema['~standard'].validate(input);
			if (inputResult.issues) {
				throw new Error(
					`Input validation failed: ${inputResult.issues.map((i) => i.message).join(', ')}`
				);
			}
			validatedInput = inputResult.value;
		}

		const agentCtx: AgentContext = new RequestAgentContext((ctx as any).agent);

		const result = inputSchema
			? await (config.handler as any)(agentCtx, validatedInput)
			: await (config.handler as any)(agentCtx);

		if (outputSchema) {
			const outputResult = await outputSchema['~standard'].validate(result);
			if (outputResult.issues) {
				throw new Error(
					`Output validation failed: ${outputResult.issues.map((i) => i.message).join(', ')}`
				);
			}
			return outputResult.value;
		}

		return result;
	};

	const agent: any = { handler };

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
			run: async (input: any) => {
				return agent.handler(ctx as unknown as AgentContext, input);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	} else {
		return {
			run: async () => {
				return agent.handler(ctx as unknown as AgentContext);
			},
		} as AgentRunner<TInput, TOutput, TStream>;
	}
};

export const createAgentMiddleware = (): MiddlewareHandler => {
	return async (ctx, next) => {
		// Populate agents object with strongly-typed keys
		const agentsObj: any = {};
		for (const [name, agentFn] of agents) {
			agentsObj[name] = createAgentRunner(agentFn, ctx);
		}
		(ctx as any).agent = agentsObj;
		return runInAgentContext(agentsObj, next);
		// ctx.keyvalue = kv;
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
		// ctx.waitUntil = async (callback: () => Promise<void>) => {
		//     callback().then(() => {
		//         console.log('callback ran');
		//     });
		// };
		// await next();
	};
};
