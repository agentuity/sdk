import type { LanguageModel } from 'ai';
import { groq } from '@ai-sdk/groq';

export const DEFAULT_EVAL_MODEL: LanguageModel = groq('openai/gpt-oss-20b');

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
