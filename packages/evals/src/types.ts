import type { LanguageModel } from 'ai';
import { xai } from '@ai-sdk/xai';

export const DEFAULT_EVAL_MODEL: LanguageModel = xai('grok-4-fast');

export type BaseEvalOptions = {
	model: LanguageModel;
};

/**
 * Middleware to transform agent input/output to preset eval input/output.
 * Allows reusing preset evals across agents with different schemas.
 *
 * @template TAgentInput - Agent's input type (inferred from generics or `any`)
 * @template TAgentOutput - Agent's output type (inferred from generics or `any`)
 * @template TEvalInput - Eval's expected input type
 * @template TEvalOutput - Eval's expected output type
 */
export type EvalMiddleware<TAgentInput, TAgentOutput, TEvalInput, TEvalOutput> = {
	transformInput: (agentInput: TAgentInput) => TEvalInput;
	transformOutput: (agentOutput: TAgentOutput) => TEvalOutput;
};
