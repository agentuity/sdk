import type { LanguageModel } from 'ai';
import { groq } from '@ai-sdk/groq';
import type { EvalContext, EvalHandlerResult } from '@agentuity/runtime';

export const DEFAULT_EVAL_MODEL: LanguageModel = groq('openai/gpt-oss-20b');

export type BaseEvalOptions = {
	model: LanguageModel;
};

/**
 * Lifecycle hooks for preset evals.
 * Called before and after the eval handler executes.
 * Hook errors are logged but don't prevent eval execution.
 *
 * @template TInput - The input type passed to hooks (agent's input, not transformed)
 * @template TOutput - The output type passed to hooks (agent's output, not transformed)
 */
export type EvalLifecycleHooks<TInput = unknown, TOutput = unknown> = {
	/**
	 * Called before the eval handler runs.
	 * Use for logging, setup, or metrics.
	 *
	 * @param ctx - Eval context with logger, tracer, storage access
	 * @param input - The agent's input (before middleware transform)
	 * @param output - The agent's output (before middleware transform)
	 */
	onStart?: (ctx: EvalContext, input: TInput, output: TOutput) => void | Promise<void>;

	/**
	 * Called after the eval handler completes successfully.
	 * Use for logging results, cleanup, or metrics.
	 *
	 * @param ctx - Eval context with logger, tracer, storage access
	 * @param input - The agent's input (before middleware transform)
	 * @param output - The agent's output (before middleware transform)
	 * @param result - The eval handler's result
	 */
	onComplete?: (
		ctx: EvalContext,
		input: TInput,
		output: TOutput,
		result: EvalHandlerResult
	) => void | Promise<void>;
};

/**
 * Middleware to transform agent input/output to preset eval input/output.
 * Allows reusing preset evals across agents with different schemas.
 * At least one transform must be provided.
 *
 * @template TAgentInput - Agent's input type (inferred from generics or `any`)
 * @template TAgentOutput - Agent's output type (inferred from generics or `any`)
 * @template TEvalInput - Eval's expected input type
 * @template TEvalOutput - Eval's expected output type
 */
export type EvalMiddleware<TAgentInput, TAgentOutput, TEvalInput, TEvalOutput> =
	| {
			transformInput: (agentInput: TAgentInput) => TEvalInput;
			transformOutput?: (agentOutput: TAgentOutput) => TEvalOutput;
	  }
	| {
			transformInput?: (agentInput: TAgentInput) => TEvalInput;
			transformOutput: (agentOutput: TAgentOutput) => TEvalOutput;
	  };
