import evalsBasicAgent from './basic';

evalsBasicAgent.createEval('separate-file-eval', {
	description: 'Eval defined in separate eval.ts file',
	handler: async (_ctx, input, output) => {
		const passed = output.doubled === true;
		return {
			success: true,
			passed,
			metadata: {
				reason: passed ? 'Correctly doubled' : 'Not doubled',
			},
		};
	},
});
