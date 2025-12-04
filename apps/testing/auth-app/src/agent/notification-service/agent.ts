import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Notification Service (Parent)',
		description: 'Parent agent for testing hyphenated parent names',
	},
	schema: {
		input: s.object({ type: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { type }) => {
		return `Notification service handling: ${type}`;
	},
});

export default agent;
