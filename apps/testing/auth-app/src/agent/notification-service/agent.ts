import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Notification Service (Parent)',
		description: 'Parent agent for testing hyphenated parent names',
	},
	schema: {
		input: z.object({ type: z.string() }),
		output: z.string(),
	},
	handler: async (_c, { type }) => {
		return `Notification service handling: ${type}`;
	},
});

export default agent;
