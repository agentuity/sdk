import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('hello', {
	description: 'A simple hello agent that greets users',
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
