import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({ name: z.string() }),
		output: z.string(),
	},
	handler: async (_c: AgentContext, { name }) => {
		return `Hello, ${name}! Welcome to Agentuity.`;
	},
});

export default agent;
