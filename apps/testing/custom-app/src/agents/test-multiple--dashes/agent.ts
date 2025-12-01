import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'test-multiple--dashes',
		description: 'Test agent with multiple dashes',
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
