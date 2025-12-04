import { createAgent, type AgentContext } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Eval Demo',
	},
	schema: {
		input: s.object({ name: s.string(), age: s.number() }),
		output: s.string(),
	},
	handler: async (_c, { name }) => {
		return `Hello, ${name}!`;
	},
});

export default agent;
