import { createAgent, type AgentContext } from '@agentuity/runtime';

const agent = createAgent({
	handler: async (_c: AgentContext) => {
		console.log('no-schema agent executed');
	},
});

export default agent;
