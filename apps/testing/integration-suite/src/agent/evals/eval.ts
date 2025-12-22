import { politenessEval } from '@agentuity/evals';
import evalsBasicAgent, { AgentOutput, AgentInput } from './basic';

/**
 * Example 1: Using canned eval with defaults
 * The eval expects { request: string, context?: string } for input
 * and { response: string } for output, so we need middleware to transform.
 */
export const politenessCheck = evalsBasicAgent.createEval(
	politenessEval<typeof AgentInput, typeof AgentOutput>({
		name: 'politeness-check',
		model: 'gpt-4o-mini',
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
 * Example 2: Inline eval without using canned evals
 * This is simpler when you don't need the canned eval's LLM logic.
 */
export const accuracyEval = evalsBasicAgent.createEval('accuracy-check', {
	description: 'Verifies the doubling calculation is correct',
	handler: async (ctx, input, output) => {
		const expected = input.value * 2;
		const passed = output.result === expected;

		return {
			success: true,
			passed,
			metadata: {
				reason: passed
					? `Correctly doubled ${input.value} to ${output.result}`
					: `Expected ${expected} but got ${output.result}`,
			},
		};
	},
});
