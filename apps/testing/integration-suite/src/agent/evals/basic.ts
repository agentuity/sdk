import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const evalsBasicAgent = createAgent('evals-basic', {
	description: 'Agent with evals for testing',
	schema: {
		input: s.object({
			value: s.number(),
		}),
		output: s.object({
			result: s.number(),
			doubled: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const result = input.value * 2;

		return {
			result,
			doubled: true,
		};
	},
});

// Create eval: Check if result is positive
evalsBasicAgent.createEval('check-positive', {
	description: 'Ensures result is greater than zero',
	handler: async (ctx, input, output) => {
		const passed = output.result > 0;
		return {
			success: true,
			passed,
			metadata: {
				reason: passed ? 'Result is positive' : 'Result is not positive',
			},
		};
	},
});

// Create eval: Check if doubled correctly
evalsBasicAgent.createEval('check-doubled', {
	description: 'Ensures value was doubled correctly',
	handler: async (ctx, input, output) => {
		const expected = input.value * 2;
		const passed = output.result === expected;

		return {
			success: true,
			score: passed ? 1.0 : 0.0,
			metadata: {
				reason: passed
					? `Correctly doubled ${input.value} to ${output.result}`
					: `Expected ${expected}, got ${output.result}`,
			},
		};
	},
});

// Create eval: Check if result is even
evalsBasicAgent.createEval('check-even', {
	description: 'Ensures result is an even number',
	handler: async (ctx, input, output) => {
		const passed = output.result % 2 === 0;

		return {
			success: true,
			score: passed ? 1.0 : 0.0,
			metadata: {
				reason: passed ? 'Result is even' : 'Result is odd',
			},
		};
	},
});

export default evalsBasicAgent;
