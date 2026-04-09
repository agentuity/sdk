/**
 * @agentuity/evals — SUSPENDED
 *
 * This package is not published in v3. The eval system is tightly coupled to
 * the v2 agent concept (createAgent, EvalContext) which no longer exists.
 * It will be rewritten from scratch with a framework-agnostic design.
 *
 * The code is kept here for reference during the rewrite.
 */

export type { EvalContext, EvalHandlerResult, EvalFunction, CreateEvalConfig } from './eval-types';
export { EvalHandlerResultSchema } from './eval-types';

export {
	createPresetEval,
	interpolatePrompt,
	generateEvalResult,
	type DefaultEvalInput,
	type DefaultEvalOutput,
	type GenerateEvalResultOptions,
} from './_utils';
export {
	DEFAULT_EVAL_MODEL,
	type BaseEvalOptions,
	type EvalLifecycleHooks,
	type EvalMiddleware,
} from './types';

// Evals (each file contains both the prompt and the eval)
export { politeness, politenessPrompt } from './politeness';
export { safety, safetyPrompt } from './safety';
export { pii, piiPrompt } from './pii';
export { conciseness, concisenessPrompt } from './conciseness';
export { adversarial, adversarialPrompt } from './adversarial';
export { ambiguity, ambiguityPrompt } from './ambiguity';
export { answerCompleteness, answerCompletenessPrompt } from './answer-completeness';
export { extraneousContent, extraneousContentPrompt } from './extraneous-content';
export { format, formatPrompt } from './format';
export { knowledgeRetention, knowledgeRetentionPrompt } from './knowledge-retention';
export { roleAdherence, roleAdherencePrompt } from './role-adherence';
export { selfReference, selfReferencePrompt } from './self-reference';
