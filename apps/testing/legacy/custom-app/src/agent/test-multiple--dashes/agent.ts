import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('test-multiple--dashes', {
	description: 'Test agent with multiple dashes',
	schema: {
		input: s.string(),
		output: s.string(),
	},
	handler: async (_c, input) => {
		return input;
	},
});

export default agent;
