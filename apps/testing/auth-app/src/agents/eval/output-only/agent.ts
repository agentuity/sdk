import { createAgent, type AgentContext } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		output: z.string(),
	},
	handler: async (_c: AgentContext) => {
		return 'Hello from output-only agent';
	},
});

export default agent;
