import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		output: z.string(),
	},
	handler: async (_c: AgentContext) => {
		return `Hello, the date is ${new Date()}`;
	},
});

export default agent;
