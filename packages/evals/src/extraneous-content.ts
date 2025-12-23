import {
	createPresetEval,
	interpolatePrompt,
	generateEvalResult,
	type DefaultEvalInput,
	type DefaultEvalOutput,
} from './_utils';
import { DEFAULT_EVAL_MODEL, type BaseEvalOptions } from './types';

export const extraneousContentPrompt = `You are evaluating whether an LLM response contains content clearly unrelated or unnecessary for fulfilling the request.

## Inputs

- USER REQUEST: {{USER_REQUEST}}
- MODEL RESPONSE: {{MODEL_RESPONSE}}

## Your task

1. Assume a strict editor who removes anything not directly serving the user's goal.
2. Identify each distinct section, paragraph, or statement in the MODEL RESPONSE.
3. For each element, determine whether it contributes to answering the USER REQUEST.
4. Flag any of the following as extraneous content:
   - Topics or information not requested and not necessary for context
   - Unsolicited advice or recommendations beyond the scope of the request
   - Self-promotional statements about capabilities
   - Unnecessary caveats or warnings unrelated to the specific request
   - Meta-commentary about the response itself (e.g., "I hope this helps!")
   - Offers to help with additional unrelated tasks
   - Background information the user clearly already knows based on their request
   - Repeated information already stated elsewhere in the response

## Score

- Start from 1.0.
- Subtract points for each extraneous element:
   - Brief unnecessary phrase or sentence: −0.2
   - Full paragraph of off-topic content: −0.4
   - Multiple paragraphs or significant tangent: −0.6
- Minimum score is 0.0.
- Multiple violations compound independently.

## Pass/Fail

- passed = true only if score ≥ {{THRESHOLD}} AND no major tangents or significant off-topic content is present.

## Constraints

- Do not credit relevant information for excusing unrelated additions.
- Do not assume the user wants additional context unless requested.
- Do not excuse extraneous content because it might be "useful" to some readers.
- Helpful-but-unsolicited content is still extraneous if not requested.
- Necessary context to understand the answer is not extraneous.

## Output format (STRICT JSON, one line reason):

{
  "score": <number between 0.0 and 1.0>,
  "passed": <true|false>,
  "metadata": {
    "reason": "<single concise sentence listing extraneous content found or confirming all content was relevant>"
  }
}`;

type ExtraneousContentEvalOptions = BaseEvalOptions & {
	threshold: number;
};

export const extraneousContent = createPresetEval<
	DefaultEvalInput,
	DefaultEvalOutput,
	ExtraneousContentEvalOptions
>({
	name: 'extraneous-content',
	description: 'Evaluates whether response contains unnecessary or off-topic content',
	options: {
		model: DEFAULT_EVAL_MODEL,
		threshold: 0.7,
	},
	handler: async (ctx, input, output, options) => {
		const prompt = interpolatePrompt(extraneousContentPrompt, {
			USER_REQUEST: input.request,
			MODEL_RESPONSE: output.response,
			THRESHOLD: options.threshold.toString(),
		});

		const evaluation = await generateEvalResult({ model: options.model, prompt });

		return {
			...evaluation,
			passed: evaluation.passed && (evaluation.score ?? 1) >= options.threshold,
		};
	},
});
