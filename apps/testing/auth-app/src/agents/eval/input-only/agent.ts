import { createAgent, type AgentContext } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Eval Input Only Demo',
	},
	schema: {
		input: z.object({ message: z.string() }),
	},
	handler: async (_c, { message }) => {
		console.log('input-only message', message);
	},
});

export default agent;
