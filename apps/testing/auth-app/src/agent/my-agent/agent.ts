import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'My Agent (Hyphenated)',
		description: 'Test agent with hyphenated name (my-agent)',
	},
	schema: {
		input: s.object({ message: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { message }) => {
		return `Processed: ${message}`;
	},
});

export default agent;
