import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.string(),
		output: z.object({ action: z.string(), result: z.string() }),
	},
	handler: async (_c: AgentContext, input) => {
		return { action: 'token', result: `you sent us: ${input}` };
	},
});

export default agent;
