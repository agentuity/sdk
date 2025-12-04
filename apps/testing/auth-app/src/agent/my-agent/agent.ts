import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'My Agent (Hyphenated)',
		description: 'Test agent with hyphenated name (my-agent)',
	},
	schema: {
		input: z.object({ message: z.string() }),
		output: z.string(),
	},
	handler: async (_c, { message }) => {
		return `Processed: ${message}`;
	},
});

export default agent;
