import { createAgent, type AgentContext } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({ message: z.string() }),
	},
	handler: async (_c: AgentContext, { message }) => {
		console.log('input-only message', message);
	},
});

export default agent;

