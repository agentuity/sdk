import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		output: z.string(),
	},
	handler: async (_c: AgentContext) => {
		return `The time is: ${new Date().toISOString()}`;
	},
});

export default agent;
