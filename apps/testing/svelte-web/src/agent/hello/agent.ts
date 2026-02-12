import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('hello', {
	description: 'A simple hello agent for Svelte framework testing',
	schema: {
		input: s.object({
			name: s.string(),
		}),
		output: s.string(),
	},
	handler: async (_c, { name }) => {
		return `Hello from Svelte, ${name}!`;
	},
});

export default agent;
