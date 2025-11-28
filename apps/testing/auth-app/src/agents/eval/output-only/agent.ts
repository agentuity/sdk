import { createAgent, type AgentContext } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Eval Output Only Demo',
	},
	schema: {
		output: z.string(),
	},
	handler: async (_c) => {
		return 'Hello from output-only agent';
	},
});

export default agent;
