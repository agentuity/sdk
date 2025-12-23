import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { politeness } from '@agentuity/evals';
import { openai } from '@ai-sdk/openai';

export const AgentInput = s.object({
	value: s.number(),
});
export const AgentOutput = s.object({
	result: s.number(),
	doubled: s.boolean(),
});

const evalsBasicAgent = createAgent('evals-basic', {
	description: 'Agent with evals for testing',
	schema: {
		input: AgentInput,
		output: AgentOutput,
	},
	handler: async (ctx, input) => {
		const result = input.value * 2;

		return {
			result,
			doubled: true,
		};
	},
});

/**
 * Example 1: Using preset eval with defaults
 * The eval expects { request: string, context?: string } for input
 * and { response: string } for output, so we need middleware to transform.
 */
export const politenessCheckCustom = evalsBasicAgent.createEval(
	politeness<typeof AgentInput, typeof AgentOutput>({
		name: 'politeness-custom',
		model: openai('gpt-4o-mini'),
		threshold: 0.7,
		middleware: {
			transformInput: (input) => ({ request: `Calculate double of ${input.value}` }),
			transformOutput: (output) => ({
				response: `Result: ${output.result}, Doubled: ${output.doubled}`,
			}),
		},
	})
);

/**
 * Example 2: Inline eval without using preset evals
 * This is simpler when you don't need the preset eval's LLM logic.
 */
export const accuracyEval = evalsBasicAgent.createEval(politeness());

/**
 * Example 3: Eval that throws to test error handling
 */
export const throwingEval = evalsBasicAgent.createEval({
	name: 'throwing-eval',
	description: 'Eval that throws to test error handling',
	handler: async (_ctx, _input, _output) => {
		throw new Error('Intentional eval error for testing');
	},
});

export default evalsBasicAgent;
