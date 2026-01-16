import separateEvalsAgent from './agent';

separateEvalsAgent.createEval('doubles-correctly', {
	description: 'Verifies the output is exactly double the input',
	handler: async (_ctx, input, output) => {
		const expected = input.value * 2;
		const passed = output.doubled === expected;
		return {
			success: true,
			passed,
			metadata: {
				reason: passed
					? `Correctly doubled ${input.value} to ${output.doubled}`
					: `Expected ${expected}, got ${output.doubled}`,
			},
		};
	},
});
