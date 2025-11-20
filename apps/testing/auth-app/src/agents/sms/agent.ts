import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'SMS Demo',
	},
	schema: {
		input: z.object({ number: z.string(), message: z.string() }),
		output: z.string(),
	},
	handler: async (_c: AgentContext, { number, message }) => {
		return `Received SMS message "${message}" from number ${number}`;
	},
});

export default agent;
