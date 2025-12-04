import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'my-test-agent',
		description: 'Test agent with dashes',
	},
	schema: {
		input: s.string(),
		output: s.string(),
	},
	handler: async (_c, input) => {
		return input;
	},
});

export default agent;
