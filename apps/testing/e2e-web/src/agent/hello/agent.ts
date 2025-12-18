import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

/**
 * Simple agent for deployment testing
 * Returns a greeting with the provided name and age
 */
const agent = createAgent('hello', {
	description: 'A simple hello agent for E2E testing',
	schema: {
		input: s.object({
			name: s.string(),
		}),
		output: s.string(),
	},
	handler: async (_c, { name }) => {
		return `Hello, ${name}!`;
	},
});

export default agent;
