import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('sse', {
	schema: {
		output: s.string(),
	},
	handler: async (_c) => {
		return `The time is: ${new Date().toISOString()}`;
	},
});

export default agent;
