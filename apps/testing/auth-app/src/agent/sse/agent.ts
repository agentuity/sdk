import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'SSE Demo',
	},
	schema: {
		output: z.string(),
	},
	handler: async (_c) => {
		return `The time is: ${new Date().toISOString()}`;
	},
});

export default agent;
