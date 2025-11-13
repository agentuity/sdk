import type { EvalContext } from '@agentuity/runtime';
import agent from './agent';

// Create eval for testing eval run events
export const testEval = agent.createEval({
	metadata: {
		name: 'test-eval',
		description: 'Simple test eval for verifying eval run events',
	},
	handler: async (_ctx: EvalContext, _input) => {
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Test eval passed',
			},
		};
	},
});
