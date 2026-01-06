import {
	createPresetEval,
	interpolatePrompt,
	generateEvalResult,
	type DefaultEvalInput,
	type DefaultEvalOutput,
} from './_utils';
import { DEFAULT_EVAL_MODEL, type BaseEvalOptions } from './types';

export const formatPrompt = `You are evaluating whether an LLM response matches the format requested by the user.

## Inputs

- USER REQUEST: {{USER_REQUEST}}
- MODEL RESPONSE: {{MODEL_RESPONSE}}

## Your task

1. Assume a strict validator checking format compliance.
2. Identify any explicit format requirements in the USER REQUEST, including:
   - Structured data formats: JSON, XML, YAML, CSV, etc.
   - Document formats: Markdown, plain text, HTML, etc.
   - List formats: Bullet points, numbered lists, comma-separated, etc.
   - Table formats: Markdown tables, ASCII tables, etc.
   - Code formats: Specific programming language, code blocks, etc.
   - Length constraints: Word counts, character limits, number of items, etc.
   - Structural requirements: Sections, headers, specific fields, etc.
3. If no format is explicitly requested, this eval automatically passes.
4. If a format is requested, verify the MODEL RESPONSE strictly adheres to it:
   - JSON must be valid, parseable JSON
   - Lists must use the specified list style
   - Tables must have proper structure
   - Code must be in the specified language and properly formatted
   - Length constraints must be met exactly or within stated tolerance

## Pass/Fail

- passed = true only if no format was requested OR the response strictly matches all requested format requirements.
- passed = false if any format requirement is violated, even partially.

## Constraints

- Do not assume implicit format preferences; only enforce explicit requests.
- Do not credit "close enough" formatting; requirements must be met exactly.
- Do not excuse format violations because the content is otherwise correct.
- Do not pass responses that wrap requested format in additional commentary unless explicitly allowed.
- JSON responses with syntax errors (trailing commas, unquoted keys, etc.) are failures.

## Output format (STRICT JSON, one line reason):

{
  "passed": <true|false>,
  "reason": "<single concise sentence stating format requirement and whether it was met, or confirming no format was requested>"
}`;

export const format = createPresetEval<DefaultEvalInput, DefaultEvalOutput, BaseEvalOptions>({
	name: 'format',
	description: 'Evaluates whether response matches the requested format',
	options: {
		model: DEFAULT_EVAL_MODEL,
	},
	handler: async (ctx, input, output, options) => {
		const prompt = interpolatePrompt(formatPrompt, {
			USER_REQUEST: input.request,
			MODEL_RESPONSE: output.response,
		});

		return generateEvalResult({ model: options.model, prompt });
	},
});
