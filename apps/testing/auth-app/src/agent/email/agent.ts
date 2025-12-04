import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Email Demo',
	},
	schema: {
		input: s.object({ from: s.string(), message: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { from, message }) => {
		return `Received email message "${message}" from ${from}`;
	},
});

export default agent;
