import { politenessEval } from '@agentuity/evals';
import evalsBasicAgent, { AgentOutput, AgentInput } from './basic';

/**
 * Example 1: Using preset eval with defaults
 * The eval expects { request: string, context?: string } for input
 * and { response: string } for output, so we need middleware to transform.
 */
export const politenessCheckCustom = evalsBasicAgent.createEval(
	politenessEval<typeof AgentInput, typeof AgentOutput>({
		name: 'politeness-custom',
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
 * Example 2: Inline eval without using preset evals
 * This is simpler when you don't need the preset eval's LLM logic.
 */
export const accuracyEval = evalsBasicAgent.createEval(politenessEval());
