import { createAgent, type AgentContext } from '@agentuity/runtime';

const agent = createAgent({
	metadata: {
		name: 'Eval No Schema Demo',
	},
	handler: async (_c) => {
		console.log('no-schema agent executed');
	},
});

export default agent;
