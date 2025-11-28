import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'My First Agent',
		description: 'This is my first agent ✨',
	},
	schema: {
		input: z.object({ name: z.string() }),
		output: z.string(),
	},
	handler: async (_c, { name }) => {
		return `Hello, ${name}! Welcome to Agentuity 🤖.`;
	},
});

export default agent;
