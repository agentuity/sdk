import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'My First Agent',
		description: 'This is my first agent ✨',
	},
	schema: {
		input: s.object({ name: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { name }) => {
		return `Hello, ${name}! Welcome to Agentuity 🤖.`;
	},
});

export default agent;
