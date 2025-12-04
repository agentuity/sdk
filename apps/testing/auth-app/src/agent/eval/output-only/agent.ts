import { createAgent, type AgentContext } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Eval Output Only Demo',
	},
	schema: {
		output: s.string(),
	},
	handler: async (_c) => {
		return 'Hello from output-only agent';
	},
});

export default agent;
