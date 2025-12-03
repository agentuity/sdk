import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Email Demo',
	},
	schema: {
		input: z.object({ from: z.string(), message: z.string() }),
		output: z.string(),
	},
	handler: async (_c, { from, message }) => {
		return `Received email message "${message}" from ${from}`;
	},
});

export default agent;
