import type { InferOutput, Schema } from '@agentuity/schema';
import type { MiddlewareHandler } from 'hono';
import type { ApiEnv, DemoContext } from '../api/context';
import { getDemoContext } from '../api/context';
import { jsonValidator } from '../api/http';

type AgentEvent = 'started' | 'completed' | 'errored';
type AgentListener = (
	event: AgentEvent,
	agent: DemoAgent<Schema, Schema>,
	ctx: DemoContext,
	error?: unknown
) => void;

interface DemoAgentConfig<TInput extends Schema, TOutput extends Schema> {
	readonly description: string;
	readonly schema: {
		readonly input: TInput;
		readonly output: TOutput;
	};
	readonly handler: (
		ctx: DemoContext,
		input: InferOutput<TInput>
	) => Promise<InferOutput<TOutput>> | InferOutput<TOutput>;
}

export interface DemoAgent<TInput extends Schema, TOutput extends Schema> {
	readonly metadata: {
		readonly description: string;
	};
	run(input: InferOutput<TInput>): Promise<InferOutput<TOutput>>;
	validator(): MiddlewareHandler<ApiEnv>;
	addEventListener(event: AgentEvent, listener: AgentListener): void;
}

const agents = new Map<string, DemoAgent<Schema, Schema>>();

export function getDemoAgents(): ReadonlyMap<string, DemoAgent<Schema, Schema>> {
	return agents;
}

export function defineDemoAgent<TInput extends Schema, TOutput extends Schema>(
	name: string,
	config: DemoAgentConfig<TInput, TOutput>
): DemoAgent<TInput, TOutput> {
	const listeners = new Map<AgentEvent, AgentListener[]>();

	const agent: DemoAgent<TInput, TOutput> = {
		metadata: {
			description: config.description,
		},

		async run(input: unknown): Promise<InferOutput<TOutput>> {
			const parsed = config.schema.input.safeParse(input);
			if (!parsed.success) {
				throw parsed.error;
			}

			const ctx = getDemoContext();

			for (const listener of listeners.get('started') ?? []) {
				listener('started', agent as DemoAgent<Schema, Schema>, ctx);
			}

			try {
				const result = await config.handler(ctx, parsed.data);
				for (const listener of listeners.get('completed') ?? []) {
					listener('completed', agent as DemoAgent<Schema, Schema>, ctx);
				}
				return result;
			} catch (error) {
				for (const listener of listeners.get('errored') ?? []) {
					listener('errored', agent as DemoAgent<Schema, Schema>, ctx, error);
				}
				throw error;
			}
		},

		validator(): MiddlewareHandler<ApiEnv> {
			return jsonValidator(config.schema.input);
		},

		addEventListener(event: AgentEvent, listener: AgentListener): void {
			const current = listeners.get(event) ?? [];
			current.push(listener);
			listeners.set(event, current);
		},
	};

	agents.set(name, agent as DemoAgent<Schema, Schema>);
	return agent;
}
