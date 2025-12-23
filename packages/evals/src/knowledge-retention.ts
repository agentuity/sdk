import { openai } from '@ai-sdk/openai';
import {
	createPresetEval,
	interpolatePrompt,
	generateEvalResult,
	type DefaultEvalInput,
	type DefaultEvalOutput,
} from './_utils';
import type { BaseEvalOptions } from './types';

export const knowledgeRetentionPrompt = `You are evaluating whether an LLM response correctly retains and applies facts or decisions provided earlier in the conversation.

## Inputs

- USER REQUEST (may include conversation history or prior context): {{USER_REQUEST}}
- MODEL RESPONSE: {{MODEL_RESPONSE}}

## Your task

1. Assume an auditor checking for context consistency and memory accuracy.
2. Identify all facts, decisions, preferences, or constraints established in the USER REQUEST or prior context, including:
   - Names, dates, numbers, or specific values mentioned
   - User preferences or requirements stated earlier
   - Decisions or conclusions reached in prior exchanges
   - Constraints or boundaries defined for the task
   - Corrections or clarifications the user provided
3. Check the MODEL RESPONSE for any of the following retention failures:
   - Contradicting previously established facts
   - Ignoring stated preferences or requirements
   - Using incorrect values for previously defined variables
   - Forgetting constraints that should limit the response
   - Asking for information already provided
   - Reverting to defaults when specific choices were made

## Score

- Start from 1.0.
- Subtract points for each retention failure:
   - Minor detail forgotten (peripheral to main task): −0.2
   - Preference or requirement ignored: −0.4
   - Key fact contradicted or misremembered: −0.5
   - Critical constraint violated: −0.6
- Minimum score is 0.0.
- Multiple failures compound independently.

## Pass/Fail

- passed = true only if score ≥ 0.7 AND no critical facts are contradicted or key constraints violated.

## Constraints

- Do not assume the response "probably meant" the correct information.
- Do not excuse retention failures because the response is otherwise helpful.
- Do not credit partial retention if critical elements are missed.
- If no prior context is provided, this eval automatically passes with score 1.0.
- Evaluate only retention of information explicitly stated, not implied.

## Output format (STRICT JSON, one line reason):

{
  "score": <number between 0.0 and 1.0>,
  "passed": <true|false>,
  "metadata": {
    "reason": "<single concise sentence listing retention failures found or confirming context was correctly maintained>"
  }
}`;

type KnowledgeRetentionEvalOptions = BaseEvalOptions & {
	threshold: number;
};

export const knowledgeRetention = createPresetEval<
	DefaultEvalInput,
	DefaultEvalOutput,
	KnowledgeRetentionEvalOptions
>({
	name: 'knowledge-retention',
	description: 'Evaluates whether response correctly retains context from earlier in conversation',
	options: {
		model: openai('gpt-4o'),
		threshold: 0.7,
	},
	handler: async (ctx, input, output, options) => {
		const prompt = interpolatePrompt(knowledgeRetentionPrompt, {
			USER_REQUEST: input.request,
			MODEL_RESPONSE: output.response,
		});

		const evaluation = await generateEvalResult({ model: options.model, prompt });

		return {
			passed: evaluation.passed && (evaluation.score ?? 1) >= options.threshold,
			score: evaluation.score,
			metadata: {
				...evaluation.metadata,
				model: options.model,
				threshold: options.threshold,
			},
		};
	},
});
