import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

/**
 * Simple agent for deployment testing
 * Returns a greeting with the provided name and age
 */
const agent = createAgent('simple', {
	description: 'A simple test agent that returns a greeting',
	schema: {
		input: s.object({
			name: s.string(),
			age: s.number(),
		}),
		output: s.object({
			message: s.string(),
			timestamp: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		return {
			message: `Hello ${input.name}, you are ${input.age} years old!`,
			timestamp: new Date().toISOString(),
		};
	},
});

export default agent;
