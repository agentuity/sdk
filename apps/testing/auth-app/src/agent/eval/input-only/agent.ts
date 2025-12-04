import { createAgent, type AgentContext } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Eval Input Only Demo',
	},
	schema: {
		input: s.object({ message: s.string() }),
	},
	handler: async (_c, { message }) => {
		console.log('input-only message', message);
	},
});

export default agent;
