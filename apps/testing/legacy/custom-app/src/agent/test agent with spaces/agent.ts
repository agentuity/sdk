import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent('test agent with spaces', {
	description: 'Test agent with spaces',
	schema: {
		input: z.string(),
		output: z.string(),
	},
	handler: async (_c, input) => {
		return input;
	},
});

export default agent;
