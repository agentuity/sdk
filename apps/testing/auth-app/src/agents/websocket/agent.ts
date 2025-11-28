import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Websockets Demo',
	},
	schema: {
		input: z.string(),
		output: z.object({ action: z.string(), result: z.string() }),
	},
	handler: async (_c, input) => {
		return { action: 'token', result: `you sent us: ${input}` };
	},
});

export default agent;
