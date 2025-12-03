import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'my-test-agent',
		description: 'Test agent with dashes',
	},
	schema: {
		input: z.string(),
		output: z.string(),
	},
	handler: async (_c, input) => {
		return input;
	},
});

export default agent;
