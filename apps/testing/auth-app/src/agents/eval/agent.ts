import { createAgent, type AgentContext } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Eval Demo',
	},
	schema: {
		input: z.object({ name: z.string(), age: z.number() }),
		output: z.string(),
	},
	handler: async (_c: AgentContext, { name }) => {
		return `Hello, ${name}!`;
	},
});

export default agent;
