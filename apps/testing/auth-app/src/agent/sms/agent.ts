import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'SMS Demo',
	},
	schema: {
		input: s.object({ number: s.string(), message: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { number, message }) => {
		return `Received SMS message "${message}" from number ${number}`;
	},
});

export default agent;
