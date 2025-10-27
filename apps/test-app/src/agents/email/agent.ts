import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({ from: z.string(), message: z.string() }),
		output: z.string(),
	},
	handler: async (_c: AgentContext, { from, message }) => {
		return `Received email message "${message}" from ${from}`;
	},
});

export default agent;
